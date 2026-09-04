export function KpiCard({
  label,
  value,
  change,
  tone,
  testId
}: {
  label: string;
  value: string;
  change: string;
  tone: "blue" | "violet" | "orange" | "green";
  testId?: string;
}) {
  const badgeStyles = {
    blue: "bg-emerald-50 text-emerald-700 border-emerald-200",
    violet: "bg-emerald-50 text-emerald-700 border-emerald-200",
    orange: "bg-slate-100 text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200"
  };

  return (
    <section
      data-testid={testId}
      className="aj-surface rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p className={`mt-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeStyles[tone]}`}>
        {change}
      </p>
    </section>
  );
}
