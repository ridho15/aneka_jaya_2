import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { confirmFixedAssetPolicy, getFixedAssetPolicy, listFixedAssets, postDepreciation } from "@/lib/accounting/fixedAssets";

const fail = (message: string, status = 400) => NextResponse.json({ success: false, message }, { status });

export async function GET() {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.view")) return fail("Akses ditolak.", 403);
  const [assets, policy] = await Promise.all([listFixedAssets(), getFixedAssetPolicy()]);
  return NextResponse.json({ success: true, data: { assets, policy } });
}

/** action=confirm_policy { capitalizationThreshold, defaultUsefulLifeMonths } | action=depreciate { period: YYYY-MM } */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.journal.manage")) return fail("Akses ditolak. Hanya Super Admin.", 403);
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === "confirm_policy") {
      const policy = await confirmFixedAssetPolicy({ capitalizationThreshold: Number(body.capitalizationThreshold), defaultUsefulLifeMonths: Number(body.defaultUsefulLifeMonths) }, user);
      return NextResponse.json({ success: true, data: policy, message: "Kebijakan aset tetap disimpan." });
    }
    if (body?.action === "depreciate") {
      const result = await postDepreciation(String(body.period || ""), { id: user.id, name: user.name, role: user.role });
      return NextResponse.json({
        success: true, data: result,
        message: `${result.posted} jurnal penyusutan diposting${result.skippedIncomplete.length ? `, ${result.skippedIncomplete.length} aset dilewati karena data belum lengkap` : ""}.`
      });
    }
    return fail("Aksi tidak dikenal.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Gagal memproses aset tetap.");
  }
}
