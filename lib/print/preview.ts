export type PrintPreviewKind = "sales" | "tempo" | "expenses";

export type PrintPreviewFormat = "txt" | "prn";

export function printPreviewEndpoint(
  kind: PrintPreviewKind,
  id: string,
  format: PrintPreviewFormat = "txt",
  layout?: "single" | "double",
) {
  const params = new URLSearchParams();
  if (format === "prn") params.set("format", "prn");
  if (layout) params.set("layout", layout);
  const query = params.toString();
  const suffix = query ? `?${query}` : "";
  return `/api/print/${kind}/${encodeURIComponent(id)}${suffix}`;
}

export function printPreviewPath(
  kind: PrintPreviewKind,
  id: string,
  auto = false,
) {
  return `/print/${kind}/${encodeURIComponent(id)}${auto ? "?auto=1" : ""}`;
}

export function printPreviewListPath(kind: PrintPreviewKind) {
  if (kind === "sales") return "/penjualan";
  if (kind === "expenses") return "/pengeluaran";
  return "/tempo";
}

export function splitPrintPreviewPages(text: string) {
  return text.split("\x0C").filter((page) => page.length > 0);
}

export async function loadPrintPreviewText(
  kind: PrintPreviewKind,
  id: string,
  fetcher: typeof fetch = fetch,
  layout?: "single" | "double",
) {
  const response = await fetcher(printPreviewEndpoint(kind, id, "txt", layout), {
    cache: "no-store",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || `Preview cetak gagal dimuat (${response.status}).`);
  }

  return text;
}
