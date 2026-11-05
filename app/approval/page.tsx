import { redirect } from "next/navigation";

// Halaman Approval tidak dipakai lagi; transaksi langsung tersimpan sebagai disetujui.
export default function ApprovalPage() {
  redirect("/dashboard");
}
