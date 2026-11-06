import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { applyCorrection, dismissCorrection, getInventoryReconciliation, type CorrectionKind } from "@/lib/accounting/inventoryReconciliation";
import { postPendingInventoryJournals } from "@/lib/accounting/inventoryPosting";
import { saveTaxStatus } from "@/lib/accounting/taxStatus";

const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

/** Dry run: hanya membaca. Tidak ada saldo yang berubah. */
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) return fail("Akses ditolak.", 403);
  return NextResponse.json({ success: true, data: await getInventoryReconciliation() });
}

/**
 * action=post_inventory_docs | apply_correction { expenseId, kind, backupConfirmed } |
 * dismiss_correction { expenseId, kind, note } | save_tax_status { status, effectiveDate }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.journal.manage")) return fail("Akses ditolak. Hanya Super Admin.", 403);
  const body = await request.json().catch(() => ({}));
  const actor = { id: user.id, name: user.name, role: user.role };
  const kind = (body?.kind === "EQUIPMENT" ? "EQUIPMENT" : "MERCHANDISE") as CorrectionKind;
  try {
    switch (body?.action) {
      case "post_inventory_docs": {
        const r = await postPendingInventoryJournals();
        return NextResponse.json({ success: true, data: r, message: `${r.posted} dokumen stok dijurnal${r.errors.length ? `, ${r.errors.length} gagal: ${r.errors[0].message}` : ""}.` });
      }
      case "apply_correction": {
        if (body.backupConfirmed !== true) return fail("Konfirmasi dulu bahwa backup database sudah dibuat.");
        const r = await applyCorrection(String(body.expenseId), kind, actor);
        return NextResponse.json({ success: true, data: r, message: r.alreadyApplied ? "Koreksi ini sudah pernah diterapkan." : "Koreksi diterapkan dengan jurnal baru; jurnal asli tetap ada." });
      }
      case "dismiss_correction":
        await dismissCorrection(String(body.expenseId), kind, String(body.note || ""), actor);
        return NextResponse.json({ success: true, message: "Ditandai bukan koreksi." });
      case "save_tax_status": {
        const status = body.status === "PKP" ? "PKP" : "NON_PKP";
        const r = await saveTaxStatus({ status, effectiveDate: String(body.effectiveDate || "") }, actor);
        return NextResponse.json({ success: true, data: r, message: "Status pajak disimpan." });
      }
      default:
        return fail("Aksi tidak dikenal.");
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal memproses.");
  }
}
