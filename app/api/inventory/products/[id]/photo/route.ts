import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { saveLocalImage } from "@/lib/opencloud/storage";

/** Unggah/ganti foto barang (Super Admin / pengelola Master Barang). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "inventory.master")) {
    return NextResponse.json({ success: false, message: "Hanya pengelola Master Barang yang bisa mengubah foto." }, { status: 403 });
  }
  const { id } = await context.params;
  const product = await prisma.inventoryProduct.findUnique({ where: { id }, select: { id: true, sku: true } });
  if (!product) return NextResponse.json({ success: false, message: "Barang tidak ditemukan." }, { status: 404 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ success: false, message: "Pilih foto dulu." }, { status: 400 });
  const saved = await saveLocalImage(file, "products", product.sku);
  if (!saved.success) return NextResponse.json(saved, { status: 400 });
  await prisma.inventoryProduct.update({ where: { id }, data: { photoUrl: saved.data.url } });
  return NextResponse.json({ success: true, data: { photoUrl: saved.data.url } }, { status: 201 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!can(await getCurrentRole(), "inventory.master")) {
    return NextResponse.json({ success: false, message: "Hanya pengelola Master Barang yang bisa mengubah foto." }, { status: 403 });
  }
  const { id } = await context.params;
  await prisma.inventoryProduct.update({ where: { id }, data: { photoUrl: null } });
  return NextResponse.json({ success: true, data: { photoUrl: null } });
}
