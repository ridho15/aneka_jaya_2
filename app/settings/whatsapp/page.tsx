import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getWhatsappProvider, listWhatsappLogs, listWhatsappRecipients } from "@/lib/whatsapp/whatsappClient";
import { WhatsAppTestButton } from "@/components/settings/WhatsAppTestButton";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.whatsapp.manage")) redirect("/settings");
  const recipients = await listWhatsappRecipients();
  const logs = await listWhatsappLogs();
  const provider = getWhatsappProvider();
  return <AppShell><div className="mb-7"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Super Admin</p><h2 className="aj-page-title text-3xl font-bold">WhatsApp Settings</h2><p className="mt-2 text-sm text-slate-600">Provider aktif: <b>{provider || "Belum dikonfigurasi"}</b>. Default timezone Asia/Jakarta. Token tetap server-side.</p></div><div className="grid gap-6 xl:grid-cols-[1fr_26rem]"><section className="aj-surface overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Nomor</th><th className="px-5 py-3">Daily</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Tempo</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{recipients.map((row) => <tr key={row.id} className="border-b border-slate-100"><td className="px-5 py-4 font-semibold">{row.name}</td><td className="px-5 py-4">{row.phoneNumber}</td><td className="px-5 py-4">{row.receivesDailyReport ? "Ya" : "Tidak"}</td><td className="px-5 py-4">{row.receivesStockAlert ? "Ya" : "Tidak"}</td><td className="px-5 py-4">{row.receivesTempoReminder ? "Ya" : "Tidak"}</td><td className="px-5 py-4">{row.isActive ? "Aktif" : "Nonaktif"}</td></tr>)}{recipients.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">Belum ada recipient WhatsApp.</td></tr>}</tbody></table></section><section className="aj-surface p-6"><h3 className="font-bold">Kirim Test WhatsApp</h3><p className="mt-2 text-sm text-slate-600">Mengirim pesan test ke recipient aktif pertama dan membuat log.</p><WhatsAppTestButton /><h3 className="mt-8 font-bold">Message log terbaru</h3><div className="mt-3 divide-y divide-slate-100">{logs.slice(0, 5).map((log) => <div key={log.id} className="py-3 text-sm"><b>{log.reportType}</b><span className="ml-2 text-slate-500">{log.status} • {log.provider}</span></div>)}{logs.length === 0 && <p className="py-3 text-sm text-slate-500">Belum ada log WhatsApp.</p>}</div></section></div></AppShell>;
}
