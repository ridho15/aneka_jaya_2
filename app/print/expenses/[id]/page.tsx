import { PrintPreviewPage } from "@/components/print/PrintPreviewPage";
import { requirePermission } from "@/lib/auth/requirePermission";

export const dynamic = "force-dynamic";

export default async function ExpensePrintPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  await requirePermission(["pengeluaran.view", "reports.finance_view"]);
  const { id } = await params;
  const { auto } = await searchParams;

  return <PrintPreviewPage kind="expenses" id={id} title="Cetak Pengeluaran" autoPrint={auto === "1"} />;
}
