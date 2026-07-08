export function KpiCard({ label, value, change, tone, testId }: { label: string; value: string; change: string; tone: "blue" | "violet" | "orange" | "green"; testId?: string }) {
  const styles = { blue: "from-blue-600 to-indigo-600", violet: "from-violet-600 to-fuchsia-600", orange: "from-orange-400 to-rose-500", green: "from-emerald-500 to-teal-600" };
  return <section data-testid={testId} className={`rounded-2xl bg-gradient-to-br ${styles[tone]} p-5 text-white shadow-lg shadow-slate-200`}><p className="text-sm font-medium text-white/80">{label}</p><p className="mt-3 text-2xl font-bold tracking-tight">{value}</p><p className="mt-3 inline-flex rounded-full bg-white/15 px-2 py-1 text-xs font-semibold">↗ {change}</p></section>;
}
