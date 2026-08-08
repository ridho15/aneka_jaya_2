import { PrintPreviewPage } from "@/components/print/PrintPreviewPage";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentUser } from "@/lib/auth/session";
import { getSalesRecordForUser } from "@/lib/sales/access";
import { notFound } from "next/navigation";

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
  const user = await getCurrentUser();
  if (!await getSalesRecordForUser(id, user)) notFound();
  const { auto } = await searchParams;

  return <PrintPreviewPage kind="sales" id={id} title="Cetak Penjualan" autoPrint={auto === "1"} />;
}
