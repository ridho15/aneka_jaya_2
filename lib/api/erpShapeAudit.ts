type UnknownRow = Record<string, unknown>;

export type FieldShape = {
  type: string;
  samples: string[];
  children?: Record<string, FieldShape>;
};

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|phone|email|alamat|address)/i;
const MAX_SAMPLE_LENGTH = 32;

function isRecord(value: unknown): value is UnknownRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function sanitizeSample(key: string, value: unknown): string | null {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return null;
    return compact.length > MAX_SAMPLE_LENGTH ? `${compact.slice(0, MAX_SAMPLE_LENGTH)}…` : compact;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[array:${value.length}]`;
  if (isRecord(value)) return "{object}";
  return null;
}

function mergeSample(shape: FieldShape, key: string, value: unknown) {
  const sample = sanitizeSample(key, value);
  if (!sample || shape.samples.includes(sample) || shape.samples.length >= 3) return;
  shape.samples.push(sample);
}

function inspectValue(key: string, value: unknown, depth: number): FieldShape {
  const shape: FieldShape = { type: valueType(value), samples: [] };
  mergeSample(shape, key, value);
  if (depth > 0 && isRecord(value)) {
    shape.children = inspectRows([value], depth - 1);
  }
  if (depth > 0 && Array.isArray(value) && isRecord(value[0])) {
    shape.children = inspectRows(value.slice(0, 3) as UnknownRow[], depth - 1);
  }
  return shape;
}

function mergeShape(target: FieldShape, source: FieldShape) {
  if (target.type !== source.type) target.type = `${target.type}|${source.type}`;
  for (const sample of source.samples) {
    if (!target.samples.includes(sample) && target.samples.length < 3) target.samples.push(sample);
  }
  if (source.children) {
    target.children ??= {};
    for (const [key, child] of Object.entries(source.children)) {
      if (!target.children[key]) target.children[key] = child;
      else mergeShape(target.children[key], child);
    }
  }
}

export function rowsFromErpPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.data)) return payload.data;
  if (isRecord(payload) && isRecord(payload.data) && Array.isArray(payload.data.data)) return payload.data.data;
  return [];
}

export function inspectRows(rows: UnknownRow[], depth = 2): Record<string, FieldShape> {
  const shape: Record<string, FieldShape> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      const nextShape = inspectValue(key, value, depth);
      if (!shape[key]) shape[key] = nextShape;
      else mergeShape(shape[key], nextShape);
    }
  }
  return Object.fromEntries(Object.entries(shape).sort(([left], [right]) => left.localeCompare(right)));
}

export function buildErpShape(endpoint: "products" | "stocks", payload: unknown) {
  const rows = rowsFromErpPayload(payload).filter(isRecord).slice(0, 3);
  return {
    endpoint,
    rowCountSampled: rows.length,
    keys: Object.keys(inspectRows(rows)).sort(),
    fields: inspectRows(rows)
  };
}
