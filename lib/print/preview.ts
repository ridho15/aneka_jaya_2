export type PrintPreviewKind = "sales" | "tempo";

export function printPreviewEndpoint(kind: PrintPreviewKind, id: string) {
  return `/api/print/${kind}/${encodeURIComponent(id)}`;
}

export function printPreviewPath(kind: PrintPreviewKind, id: string, auto = false) {
  return `/print/${kind}/${encodeURIComponent(id)}${auto ? "?auto=1" : ""}`;
}

export async function loadPrintPreviewText(
  kind: PrintPreviewKind,
  id: string,
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(printPreviewEndpoint(kind, id), { cache: "no-store" });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Preview cetak gagal dimuat (${response.status}).`);
  }

  return text;
}
