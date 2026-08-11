import { notFound, redirect } from "next/navigation";
import { PrintPreviewPage } from "@/components/print/PrintPreviewPage";
import { getCurrentUser } from "@/lib/auth/session";
import { findMjInvoice } from "@/lib/integrations/mj/service";

export const dynamic = "force-dynamic";

export default async function MjInvoicePrintPage({ params, searchParams }: { params: Promise<{ external_reference: string }>; searchParams: Promise<{ auto?: string }> }) {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") redirect("/no-access");
  const { external_reference } = await params;
  const row = await findMjInvoice(external_reference).catch(() => undefined);
  if (!row) notFound();
  const { auto } = await searchParams;
  return <PrintPreviewPage kind="sales" id={row.id} title="Cetak Invoice MJ" autoPrint={auto === "1"} />;
}
