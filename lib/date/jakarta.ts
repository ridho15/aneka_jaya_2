const TIME_ZONE = "Asia/Jakarta";
export const JAKARTA_TIME_ZONE = TIME_ZONE;

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

export function jakartaDateTimeLocalValue(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const records = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(date);
  const get = (type: string) => records.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function jakartaTimestampFromLocal(value: string) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) return new Date(`${value}+07:00`).toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Tanggal dan jam transaksi tidak valid.");
  return date.toISOString();
}

export function transactionDateKey(transactionAt: string) {
  return jakartaDateKey(new Date(transactionAt));
}

export function transactionNumberFor(dateKey: string, sequence: number) {
  const [year, month, day] = dateKey.split("-");
  return `${day}${month}${year.slice(-2)}-${String(sequence).padStart(2, "0")}`;
}

export function formatJakartaDate(value: string | Date = new Date()) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value instanceof Date ? value : new Date(value));
}

export function formatJakartaDateTime(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const dateText = new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
  const timeText = new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
  return `${dateText}, ${timeText} WIB`;
}

export function formatJakartaDateTimeCompact(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date).replace(",", "");
}

export function jakartaDateFromKey(value?: string | null) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value as string : jakartaDateKey();
}

export function jakartaMonthFromKey(value?: string | null) {
  return /^\d{4}-\d{2}$/.test(value || "") ? value as string : jakartaMonthKey();
}
