import type { CategorySummary } from "@/lib/dashboard/summary";

const colors = ["#8b5cf6", "#06b6d4", "#fbbf24", "#fb7185", "#10b981"];

export function CategoryChart({ data }: { data: CategorySummary[] }) {
  const gradient = data.map((item, index) => {
    const start = data.slice(0, index).reduce((sum, entry) => sum + entry.percentage, 0);
    const end = start + item.percentage;
    return `${colors[index % colors.length]} ${start}% ${end}%`;
  }).join(", ");
  return <section className="aj-surface p-5 sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-600">Produk</p><h2 className="mt-1 text-lg font-bold tracking-tight">Penjualan per kategori</h2>{data.length === 0 ? <div className="grid h-40 place-items-center text-sm text-slate-500">Belum ada data kategori penjualan.</div> : <div className="mt-6 flex items-center gap-5"><div className="relative grid h-28 w-28 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${gradient})` }}><div className="grid h-20 w-20 place-items-center rounded-full bg-white text-center"><b className="text-xl">100%</b><span className="text-[10px] text-slate-500">Penjualan</span></div></div><div className="min-w-0 flex-1 space-y-2.5">{data.map((item, index) => <div key={item.label}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 text-slate-600"><i className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{item.label}</span></span><b>{Math.round(item.percentage)}%</b></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: colors[index % colors.length] }} /></div></div>)}</div></div>}</section>;
}
