const TIME_ZONE = "Asia/Jakarta";

function parts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const records = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => records.find((part) => part.type === type)?.value || "";
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function jakartaDateKey(value: string | Date = new Date()) {
  const dateParts = parts(value);
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

export function jakartaMonthKey(value: string | Date = new Date()) {
  const dateParts = parts(value);
  return `${dateParts.year}-${dateParts.month}`;
}

export function formatJakartaDate(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value instanceof Date ? value : new Date(value));
}

export function jakartaDateFromKey(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value as string : jakartaDateKey();
}

export function jakartaMonthFromKey(value?: string | null) {
  return /^\d{4}-\d{2}$/.test(value || "") ? value as string : jakartaMonthKey();
}
