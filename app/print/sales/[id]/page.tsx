import { PrintPreviewPage } from "@/components/print/PrintPreviewPage";
import { requirePermission } from "@/lib/auth/requirePermission";

export const dynamic = "force-dynamic";

export default async function SalesPrintPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  await requirePermission(["reports.view", "penjualan.create"]);
  const { id } = await params;
  const { auto } = await searchParams;

  return <PrintPreviewPage kind="sales" id={id} title="Cetak Penjualan" autoPrint={auto === "1"} />;
}
