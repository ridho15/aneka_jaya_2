import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { WhatsAppRecipientManager } from "@/components/settings/WhatsAppRecipientManager";
import { WhatsAppTestButton } from "@/components/settings/WhatsAppTestButton";
import { can } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";
import { getWhatsappProviderStatus, listWhatsappLogs, listWhatsappRecipients } from "@/lib/whatsapp/whatsappClient";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  const role = await getCurrentRole();
  if (!can(role, "settings.whatsapp.manage")) redirect("/settings");
  const recipients = await listWhatsappRecipients();
  const logs = await listWhatsappLogs(10);
  const status = getWhatsappProviderStatus();
  return <AppShell>
    <div className="mb-7">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Super Admin</p>
      <h2 className="aj-page-title text-3xl font-bold">WhatsApp Settings</h2>
      <p className="mt-2 text-sm text-slate-600">Kelola recipient WhatsApp untuk daily report, stock alert, dan tempo reminder. Token tetap server-side.</p>
    </div>
    <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_26rem]">
      <section className={`aj-surface border p-5 ${status.ready ? "border-emerald-100" : "border-amber-200 bg-amber-50"}`}>
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Provider Status</p>
        <h3 className={`mt-2 text-xl font-black ${status.ready ? "text-emerald-700" : "text-amber-800"}`}>{status.label}</h3>
        <p className="mt-1 text-sm text-slate-600">Provider: <b>{status.provider || "Belum dikonfigurasi"}</b></p>
        <p className="mt-1 text-sm text-slate-600">{status.message}</p>
      </section>
      <section className="aj-surface p-5">
        <h3 className="font-bold">Kirim Test WhatsApp</h3>
        <p className="mt-2 text-sm text-slate-600">Pilih recipient aktif untuk mengirim pesan test dan membuat log aman.</p>
        <WhatsAppTestButton recipients={recipients.map((row) => ({ id: row.id, name: row.name, isActive: row.isActive }))} />
      </section>
    </div>
    <WhatsAppRecipientManager initialRecipients={recipients} />
    <section className="aj-surface mt-6 p-6">
      <h3 className="font-bold">Message log terbaru</h3>
      <p className="mt-1 text-sm text-slate-500">Log hanya menampilkan ringkasan aman, tanpa isi pesan penuh.</p>
      <div className="mt-3 divide-y divide-slate-100">
        {logs.map((log) => <div key={log.id} className="py-3 text-sm">
          <b>{log.reportType}</b><span className="ml-2 text-slate-500">{log.status} • {log.provider} • {log.recipientNameSnapshot} • {log.phoneMaskedSnapshot}</span>
          {log.errorMessage && <p className="mt-1 text-xs text-red-700">{log.errorMessage}</p>}
        </div>)}
        {logs.length === 0 && <p className="py-3 text-sm text-slate-500">Belum ada log WhatsApp.</p>}
      </div>
    </section>
  </AppShell>;
}
