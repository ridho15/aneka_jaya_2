import { NextResponse } from "next/server";
import { ApprovalForbiddenError, isApprovalAction, updateApprovalStatus } from "@/lib/approval/store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await request.json().catch(() => null);
  if (!isApprovalAction(body?.action)) {
    return NextResponse.json({ success: false, message: "Action approval tidak valid." }, { status: 400 });
  }
  try {
    const { id } = await params;
    const data = await updateApprovalStatus(id, body?.action, body?.reason);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof ApprovalForbiddenError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 403 });
    }
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Approval gagal." }, { status: 400 });
  }
}
