import { AppShell } from "@/components/layout/AppShell";
import { requirePermission } from "@/lib/auth/requirePermission";
import { listRates } from "@/lib/currency/ratesStore";
import { CurrencyRateManager, type CurrencyRateItem } from "@/components/accounting/CurrencyRateManager";

export const dynamic = "force-dynamic";

export default async function AkuntansiKursPage() {
  await requirePermission("accounting.view");

  const rawRates = await listRates();
  const rates: CurrencyRateItem[] = rawRates.map((r) => ({
    id: r.id,
    currency: r.currency,
    rateDate: r.rateDate,
    rateType: r.rateType,
    rate: r.rate,
    source: r.source,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            Kurs Valuta Asing Harian
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Pusat manajemen kurs USD dan RMB untuk akuntansi pembelian valas, landed cost impor, dan realisasi selisih kurs.
          </p>
        </div>

        <CurrencyRateManager initialRates={rates} />
      </div>
    </AppShell>
  );
}
