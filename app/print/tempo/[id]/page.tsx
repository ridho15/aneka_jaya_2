import { PrintPreviewPage } from "@/components/print/PrintPreviewPage";
import { requirePermission } from "@/lib/auth/requirePermission";

export const dynamic = "force-dynamic";

export default async function TempoPrintPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  await requirePermission(["tempo.view", "reports.finance_view"]);
  const { id } = await params;
  const { auto } = await searchParams;

  return <PrintPreviewPage kind="tempo" id={id} title="Cetak Pembayaran Tempo" autoPrint={auto === "1"} />;
}
