import { ContinuousPaperPreview } from "@/components/print/ContinuousPaperPreview";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getCurrentUser } from "@/lib/auth/session";
import { getSalesRecordForUser } from "@/lib/sales/access";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SalesContinuousPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  await requirePermission(["reports.view", "penjualan.create"]);
  const { id } = await params;
  const user = await getCurrentUser();
  if (!(await getSalesRecordForUser(id, user))) notFound();
  const { auto } = await searchParams;

  return (
    <ContinuousPaperPreview
      kind="sales"
      id={id}
      title="Cetak Continuous Form LX-310"
      autoPrint={auto === "1"}
    />
  );
}
