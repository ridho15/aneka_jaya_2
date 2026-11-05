import { NextResponse } from "next/server";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { searchCustomers } from "@/lib/customers/store";

export async function GET(request: Request) {
  const role = await getCurrentRole();
  if (!can(role, "penjualan.create")) {
    return NextResponse.json({ success: false, message: "Tidak punya akses daftar customer." }, { status: 403 });
  }
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    return NextResponse.json({ success: true, data: await searchCustomers(q) });
  } catch {
    return NextResponse.json({ success: false, message: "Daftar customer gagal dimuat." }, { status: 500 });
  }
}
