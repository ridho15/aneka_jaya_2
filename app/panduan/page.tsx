import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { can, roleLabel, type Permission } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type GuideSection = {
  title: string;
  eyebrow: string;
  description: string;
  href: string;
  screenshot: string;
  permissions: Permission[];
  steps: string[];
  notes?: string[];
  checks?: string[];
};

const sections: GuideSection[] = [
  {
    title: "Dashboard Operasional",
    eyebrow: "Ringkasan",
    description: "Pantau omzet, Kas/TF, tempo, produk ERP, profit operasional, grafik performa, dan breakdown rekening.",
    href: "/dashboard",
    screenshot: "/guide/screenshots/dashboard.png",
    permissions: ["dashboard.view"],
    steps: [
      "Buka Dashboard untuk melihat KPI bulan berjalan dan hari ini.",
      "Gunakan filter tanggal, pembayaran, dan rekening/bank untuk mempersempit data.",
      "Klik rekening pada card pembayaran untuk membuka riwayat transaksi rekening tersebut."
    ],
    notes: ["Profit Operasional hanya tampil untuk Super Admin/OWNER."],
    checks: [
      "Omzet hari ini memakai tanggal transaksi, bukan tanggal input.",
      "Kas/TF hanya menghitung pembayaran Cash dan Transfer.",
      "Profit Operasional menghitung transaksi lokal/non-AJ sesuai setting."
    ]
  },
  {
    title: "Input Penjualan",
    eyebrow: "Transaksi",
    description: "Buat penjualan Cash, TF, Tempo, atau Other dengan tipe transaksi dan rekening penerima yang sesuai.",
    href: "/penjualan/input",
    screenshot: "/guide/screenshots/input-penjualan.png",
    permissions: ["penjualan.create"],
    steps: [
      "Pilih tipe transaksi dan metode pembayaran.",
      "Untuk Cash, rekening otomatis diarahkan ke Kas Walk In.",
      "Untuk transaksi ERP, pilih produk ERP serta gudang/rak stok per item.",
      "Simpan transaksi. Jika transaksi diarahkan ke ERP, status invoice, release stok, dan payment akan dicatat terpisah."
    ],
    notes: ["Jika stok sudah release lalu transaksi diedit, ERP bisa meminta cancel dan koreksi baru."],
    checks: [
      "Pastikan customer, tipe, tanggal, metode pembayaran, dan rekening sudah benar sebelum simpan.",
      "Untuk item ERP, pastikan qty tidak melebihi stok gudang/rak yang dipilih.",
      "Untuk Tempo, isi jatuh tempo dan nama customer yang jelas."
    ]
  },
  {
    title: "Riwayat Penjualan",
    eyebrow: "Audit transaksi",
    description: "Cari transaksi, lihat detail, cetak, edit bila masih diperbolehkan, atau cancel sesuai status transaksi.",
    href: "/penjualan",
    screenshot: "/guide/screenshots/riwayat-penjualan.png",
    permissions: ["penjualan.create", "reports.view"],
    steps: [
      "Gunakan filter tanggal, tipe, pembayaran, rekening, approval, dan ERP Sync.",
      "Buka detail transaksi untuk melihat item, status invoice ERP, release stok, payment ERP, dan total.",
      "Gunakan Edit hanya jika perubahan masih sesuai aturan ERP. Transaksi yang sudah release biasanya perlu cancel dan koreksi."
    ],
    checks: [
      "Invoice ERP synced berarti invoice sudah dibuat atau diupdate di ERP.",
      "Release Stok released berarti stok ERP sudah berkurang.",
      "Payment ERP paid/partial berarti pembayaran sudah tercatat di ERP."
    ]
  },
  {
    title: "Detail, Cancel, dan Koreksi",
    eyebrow: "Kontrol transaksi",
    description: "Gunakan detail transaksi untuk memeriksa status lengkap dan melakukan cancel/void bila transaksi ERP sudah masuk proses lanjutan.",
    href: "/penjualan",
    screenshot: "/guide/screenshots/detail-penjualan.png",
    permissions: ["penjualan.create", "reports.view"],
    steps: [
      "Buka detail transaksi dari Riwayat Penjualan.",
      "Periksa Invoice ERP, Release Stok, Payment ERP, ERP Reference, Release Reference, dan Payment Reference.",
      "Jika transaksi salah input tetapi stok/payment sudah diproses ERP, gunakan Cancel dengan alasan yang jelas.",
      "Setelah cancel ERP sukses, buat transaksi koreksi baru dengan data yang benar."
    ],
    notes: ["Cancel/void bukan hapus data. ERP membalik efek invoice, stok, payment, piutang, dan jurnal melalui reversal."],
    checks: [
      "Stok dikembalikan oleh ERP melalui stock reversal.",
      "Jurnal lama tidak dihapus; ERP membuat jurnal pembalik.",
      "Payment yang sudah tercatat dibatalkan/reverse oleh ERP."
    ]
  },
  {
    title: "ERP Sync",
    eyebrow: "Integrasi",
    description: "Pantau dan retry transaksi yang belum berhasil terkirim, release stok, payment, atau pengeluaran ERP.",
    href: "/erp-sync",
    screenshot: "/guide/screenshots/erp-sync.png",
    permissions: ["erp_sync.retry"],
    steps: [
      "Periksa ringkasan pending, failed, dan synced.",
      "Klik Retry pada transaksi yang perlu dikirim ulang.",
      "Jika ERP menolak update karena transaksi sudah masuk proses lanjutan, lakukan cancel/void lalu buat koreksi baru."
    ],
    notes: ["Retry tidak menghapus data. Semua hasil sinkronisasi tercatat di audit trail."],
    checks: [
      "Pending berarti menunggu dikirim atau diproses ulang.",
      "Failed berarti ERP menolak atau integrasi belum lengkap.",
      "Synced berarti invoice sudah aman; cek juga status stok dan payment."
    ]
  },
  {
    title: "Pengaturan ERP Sync",
    eyebrow: "Super Admin",
    description: "Atur apakah edit transaksi ERP langsung menjalankan sync otomatis atau tetap menunggu retry manual.",
    href: "/settings/erp-sync",
    screenshot: "/guide/screenshots/settings-erp-sync.png",
    permissions: ["settings.erp_sync.manage"],
    steps: [
      "Aktifkan auto sync jika ingin transaksi ERP yang diedit langsung dicoba sinkron ulang.",
      "Matikan auto sync jika ingin tim memeriksa perubahan dulu dari halaman ERP Sync.",
      "Gunakan mode otomatis dengan hati-hati untuk transaksi yang sudah release stok atau payment."
    ],
    checks: [
      "Mode otomatis tidak memaksa ERP menerima update yang berisiko.",
      "Jika ERP menolak update, transaksi tetap masuk failed dengan pesan jelas.",
      "Mode ini hanya bisa diubah oleh Super Admin/OWNER."
    ]
  },
  {
    title: "Pengeluaran dan Laporan Finance",
    eyebrow: "Finance",
    description: "Catat pengeluaran, pantau piutang tempo, dan buka laporan finance sesuai akses role.",
    href: "/reports/finance",
    screenshot: "/guide/screenshots/laporan-finance.png",
    permissions: ["pengeluaran.view", "reports.finance_view", "tempo.view"],
    steps: [
      "Input Pengeluaran dipakai untuk mencatat biaya operasional.",
      "Riwayat Pengeluaran membantu memfilter dan audit biaya approved.",
      "Tempo dan Laporan Finance dipakai untuk memantau piutang dan pengeluaran."
    ],
    checks: [
      "Finance dapat fokus pada pengeluaran, tempo, dan laporan finance.",
      "Payment Tempo ke ERP diproses setelah invoice dan release stok aman."
    ]
  },
  {
    title: "Stock Barang",
    eyebrow: "Inventory",
    description: "Lihat produk dan stok ERP per gudang/rak, serta gunakan filter agar data tetap ringan.",
    href: "/barang",
    screenshot: "/guide/screenshots/stock-barang.png",
    permissions: ["stock.view"],
    steps: [
      "Buka Stock Barang untuk melihat daftar produk dari ERP.",
      "Gunakan Stok Barang untuk cek stok per gudang/rak.",
      "Saat input penjualan ERP, pilih stok dari gudang/rak yang benar agar release stok akurat."
    ],
    checks: [
      "Stok ERP berkurang setelah release, bukan sekadar invoice dibuat.",
      "Jika stok kurang, ERP Sync akan menampilkan error stock insufficient."
    ]
  }
];

const roleGuides = [
  {
    role: "OWNER",
    title: "Super Admin / OWNER",
    description: "Mengelola seluruh aplikasi, setting ERP Sync, profit operasional, user, master data, retry ERP, cancel, dan audit.",
    permissions: ["settings.view", "settings.erp_sync.manage", "erp_sync.retry", "audit.view"] as Permission[]
  },
  {
    role: "ADMIN",
    title: "Admin",
    description: "Fokus input penjualan serta melihat detail dan mencetak riwayat penjualan yang dibuat oleh akunnya sendiri.",
    permissions: ["penjualan.create"] as Permission[]
  },
  {
    role: "FINANCE",
    title: "Finance",
    description: "Fokus pengeluaran, tempo, pembayaran, dan laporan finance.",
    permissions: ["pengeluaran.view", "tempo.view", "reports.finance_view"] as Permission[]
  },
  {
    role: "MANAGER",
    title: "Manager",
    description: "Fokus approval, laporan finance, tempo, dan audit perubahan.",
    permissions: ["approval.view", "approval.approve", "reports.finance_view", "audit.view"] as Permission[]
  }
];

const workflows = [
  {
    title: "Alur penjualan ERP aman",
    steps: [
      "Input transaksi dengan produk ERP, gudang/rak, rekening, dan metode pembayaran yang benar.",
      "SLM membuat invoice ERP sesuai tipe transaksi yang diarahkan ke ERP.",
      "Jika auto release aktif, SLM langsung release stok setelah invoice sukses.",
      "Jika payment Cash/TF perlu dikirim ke ERP, SLM memproses payment setelah stok released.",
      "Jika salah input setelah release, gunakan cancel/void lalu buat koreksi baru."
    ]
  },
  {
    title: "Alur cancel/void",
    steps: [
      "Buka detail transaksi lalu klik Cancel.",
      "Isi alasan cancel yang jelas.",
      "SLM mengirim sales cancellation ke ERP dengan ERP reference, release reference, dan payment reference.",
      "ERP membalik invoice, stok, payment, piutang, dan jurnal.",
      "SLM menyimpan status cancelled dan audit trail."
    ]
  },
  {
    title: "Alur auto sync setelah edit",
    steps: [
      "Super Admin mengaktifkan setting di Pengaturan ERP Sync.",
      "User mengedit transaksi ERP.",
      "SLM menyimpan perubahan lokal lalu langsung mencoba retry sinkronisasi.",
      "Jika ERP menerima update, proses lanjut ke release stok/payment.",
      "Jika ERP menolak karena transaksi sudah lanjut, status menjadi failed dan user perlu cancel+koreksi."
    ]
  }
];

const faqs = [
  {
    question: "Kenapa transaksi statusnya pending?",
    answer: "Pending berarti SLM sudah menyimpan data lokal, tetapi proses ERP berikutnya masih menunggu retry atau auto sync. Untuk transaksi ERP, cek tiga status: Invoice ERP, Release Stok, dan Payment ERP."
  },
  {
    question: "Kenapa ERP menolak update transaksi?",
    answer: "Biasanya karena invoice sudah masuk proses lanjutan seperti stok sudah release, payment tercatat, delivery/gudang diproses, atau jurnal sudah terbentuk. Jalur aman adalah cancel/void lalu buat transaksi koreksi baru."
  },
  {
    question: "Apakah cancel menghapus transaksi?",
    answer: "Tidak. Cancel menjaga audit. ERP membuat reversal untuk stok, payment, piutang, dan jurnal. SLM menyimpan transaksi sebagai cancelled."
  },
  {
    question: "Kapan stok ERP berkurang?",
    answer: "Stok ERP berkurang setelah SLM memanggil stock release dan ERP mengembalikan status released. Create invoice saja tidak otomatis mengurangi stok jika release belum dijalankan."
  }
];

function sectionVisible(role: Parameters<typeof can>[0], section: GuideSection) {
  return section.permissions.some((permission) => can(role, permission));
}

export default async function PanduanPage() {
  const role = await getCurrentRole();
  if (!can(role, "guide.view")) redirect("/no-access");
  const visibleSections = sections.filter((section) => sectionVisible(role, section));
  const visibleRoleGuides = roleGuides.filter((item) => item.permissions.some((permission) => can(role, permission)));
  const canViewWorkflows = can(role, "penjualan.create") || can(role, "erp_sync.retry") || can(role, "settings.erp_sync.manage");

  return (
    <AppShell>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Panduan aplikasi</p>
        <h2 className="aj-page-title text-3xl font-bold">Panduan Penggunaan SLM</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Satu halaman panduan kerja harian. Konten di bawah otomatis menyesuaikan role aktif Anda: {roleLabel(role)}.
        </p>
      </div>

      <section className="aj-surface mb-6 p-5 sm:p-6">
        <div className="mb-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-700">Role aktif</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{roleLabel(role)}</p>
            <p className="mt-1 text-sm text-slate-600">Panduan hanya menampilkan area yang sesuai akses Anda.</p>
          </div>
          <div className="rounded-md border border-slate-200 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Mulai cepat</p>
            <p className="mt-1 text-sm text-slate-700">Gunakan daftar bagian di bawah untuk lompat ke alur kerja yang dibutuhkan.</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-amber-700">Catatan ERP</p>
            <p className="mt-1 text-sm text-amber-800">Transaksi yang sudah release stok umumnya perlu cancel dan koreksi bila ada salah input.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleSections.map((section) => (
            <a key={section.title} href={`#${slug(section.title)}`} className="rounded-md border border-slate-200 p-4 transition hover:border-emerald-400 hover:bg-emerald-50">
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">{section.eyebrow}</p>
              <p className="mt-1 font-bold text-slate-900">{section.title}</p>
            </a>
          ))}
        </div>
      </section>

      {visibleRoleGuides.length > 0 && (
        <section className="aj-surface mb-6 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Akses berdasarkan role</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Apa yang perlu dilakukan role Anda</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visibleRoleGuides.map((item) => (
              <div key={item.role} className="rounded-md border border-slate-200 p-4">
                <p className="font-bold text-slate-900">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {canViewWorkflows && (
        <section className="aj-surface mb-6 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Alur kerja utama</p>
          <h3 className="mt-1 text-xl font-bold text-slate-950">Urutan operasional yang aman</h3>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {workflows.map((workflow) => (
              <div key={workflow.title} className="rounded-md border border-slate-200 p-4">
                <p className="font-bold text-slate-900">{workflow.title}</p>
                <ol className="mt-3 space-y-2">
                  {workflow.steps.map((step, index) => (
                    <li key={step} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <span className="text-xs font-bold text-emerald-700">{index + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-6">
        {visibleSections.map((section) => (
          <section key={section.title} id={slug(section.title)} className="aj-surface overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">{section.eyebrow}</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{section.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
                <ol className="mt-5 space-y-3">
                  {section.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                {section.notes?.length ? (
                  <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {section.notes.join(" ")}
                  </div>
                ) : null}
                {section.checks?.length ? (
                  <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.13em] text-slate-500">Checklist</p>
                    <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                      {section.checks.map((item) => <li key={item}>- {item}</li>)}
                    </ul>
                  </div>
                ) : null}
                <a className="mt-5 inline-flex rounded-md border border-emerald-300 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50" href={section.href}>Buka halaman</a>
              </div>
              <div className="border-t border-slate-100 bg-slate-50 p-4 lg:border-l lg:border-t-0">
                <img
                  src={section.screenshot}
                  alt={`Screenshot ${section.title}`}
                  className="h-auto w-full rounded-md border border-slate-200 bg-white shadow-sm"
                />
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="aj-surface mt-6 p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">FAQ</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950">Error umum dan cara membaca status</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.question} className="rounded-md border border-slate-200 p-4">
              <p className="font-bold text-slate-900">{faq.question}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
