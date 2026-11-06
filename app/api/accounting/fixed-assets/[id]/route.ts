import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/audit/store";
import { updateFixedAsset } from "@/lib/accounting/fixedAssets";

const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD").nullable().optional();
const schema = z.object({
  name: z.string().trim().min(1, "Nama aset wajib diisi").max(160).optional(),
  acquisitionDate: dateOrNull,
  acquisitionCost: z.number().positive().optional(),
  locationName: z.string().trim().max(160).nullable().optional(),
  availableForUseDate: dateOrNull,
  usefulLifeMonths: z.number().int().min(1, "Umur manfaat minimal 1 bulan").max(600).nullable().optional(),
  residualValue: z.number().min(0, "Nilai residu tidak boleh minus").nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!can(user.role, "accounting.journal.manage")) return NextResponse.json({ success: false, message: "Akses ditolak." }, { status: 403 });
  const { id } = await params;
  try {
    const input = schema.parse(await request.json());
    const asset = await updateFixedAsset(id, input);
    await recordAudit({ entityType: "fixed_asset", entityId: id, action: "update", afterValue: asset, reason: `Data aset ${asset.assetNumber} diubah oleh ${user.name}` }).catch(() => undefined);
    return NextResponse.json({ success: true, data: asset });
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Gagal menyimpan aset.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
