export type PrintPreviewKind = "sales" | "tempo" | "expenses";

export type PrintPreviewFormat = "txt" | "prn";

export function printPreviewEndpoint(kind: PrintPreviewKind, id: string, format: PrintPreviewFormat = "txt") {
  const suffix = format === "prn" ? "?format=prn" : "";
  return `/api/print/${kind}/${encodeURIComponent(id)}${suffix}`;
}

export function printPreviewPath(kind: PrintPreviewKind, id: string, auto = false) {
  return `/print/${kind}/${encodeURIComponent(id)}${auto ? "?auto=1" : ""}`;
}

export function printPreviewListPath(kind: PrintPreviewKind) {
  if (kind === "sales") return "/penjualan";
  if (kind === "expenses") return "/pengeluaran";
  return "/tempo";
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
