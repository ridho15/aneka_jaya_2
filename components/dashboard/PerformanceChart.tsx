"use client";

import { useMemo, useState } from "react";
import type { MonthlyPerformance } from "@/lib/dashboard/summary";

type Props = {
  data: MonthlyPerformance[];
};

export function PerformanceChart({ data }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  // Financial aggregates for the period
  const totalSales = useMemo(() => data.reduce((sum, item) => sum + (item.sales || 0), 0), [data]);
  const totalExpenses = useMemo(() => data.reduce((sum, item) => sum + (item.expenses || 0), 0), [data]);
  const netProfit = totalSales - totalExpenses;
  const netMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;
  const avgMonthlySales = data.length > 0 ? totalSales / data.length : 0;

  // Chart coordinate calculations
  const rawMax = Math.max(0, ...data.flatMap((item) => [item.sales || 0, item.expenses || 0]));
  const maximum = rawMax > 0 ? rawMax * 1.15 : 1000000; // 15% headroom

  const chartLeft = 70;
  const chartRight = 485;
  const chartTop = 28;
  const chartBottom = 180;
  const chartHeight = chartBottom - chartTop;

  const y = (val: number) => chartBottom - (maximum > 0 ? (val / maximum) * chartHeight : 0);
  const x = (index: number) =>
    data.length <= 1 ? (chartLeft + chartRight) / 2 : chartLeft + index * ((chartRight - chartLeft) / (data.length - 1));

  const barWidth = Math.max(10, Math.min(26, 240 / Math.max(1, data.length)));
  const columnWidth = data.length > 1 ? (chartRight - chartLeft) / (data.length - 1) : 60;

  const salesPoints = data.map((item, index) => `${x(index)},${y(item.sales || 0)}`).join(" ");

  // Formatter functions
  const rupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(val);

  const rupiahCompact = (val: number) => {
    if (val === 0) return "Rp 0";
    const abs = Math.abs(val);
    if (abs >= 1_000_000_000) {
      return `Rp ${(val / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
    }
    if (abs >= 1_000_000) {
      return `Rp ${(val / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
    }
    if (abs >= 1_000) {
      return `Rp ${(val / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
    }
    return `Rp ${val}`;
  };

  // Y-axis grid steps (4 levels)
  const yTicks = [
    { value: maximum, yPos: y(maximum) },
    { value: maximum * 0.75, yPos: y(maximum * 0.75) },
    { value: maximum * 0.5, yPos: y(maximum * 0.5) },
    { value: maximum * 0.25, yPos: y(maximum * 0.25) },
    { value: 0, yPos: chartBottom }
  ];

  // Area under curve polygon
  const areaPath =
    data.length > 0
      ? `M ${x(0)} ${chartBottom} ` +
        data.map((item, index) => `L ${x(index)} ${y(item.sales || 0)}`).join(" ") +
        ` L ${x(data.length - 1)} ${chartBottom} Z`
      : "";

  const activeItem = activeIdx !== null ? data[activeIdx] : null;
  const activeXPercent = activeIdx !== null ? (x(activeIdx) / 500) * 100 : 50;

  return (
    <section
      data-testid="dashboard-performance-chart"
      data-performance={JSON.stringify(data)}
      className="aj-surface overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
              Performa
            </span>
            <span className="text-xs text-slate-400">• Periode Dashboard</span>
          </div>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Penjualan & Pengeluaran</h2>
        </div>

        {/* Legend & Toggle */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className="h-3 w-3 rounded-full bg-blue-600 shadow-xs" />
            Penjualan (Omset)
          </span>
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className="h-3 w-3 rounded-sm bg-orange-400 shadow-xs" />
            Pengeluaran (Beban)
          </span>
          <button
            type="button"
            onClick={() => setShowTable(!showTable)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {showTable ? "📊 Sembunyikan Tabel" : "📋 Lihat Rincian Angka"}
          </button>
        </div>
      </div>

      {/* Financial Summary Metric Strip */}
      <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-4 sm:px-6">
        <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Total Penjualan</p>
          <p className="mt-0.5 text-base font-extrabold text-blue-950 sm:text-lg">{rupiah(totalSales)}</p>
          <p className="text-[11px] text-slate-500">Rerata {rupiahCompact(avgMonthlySales)}/bln</p>
        </div>

        <div className="rounded-xl border border-orange-100 bg-white p-3 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">Total Pengeluaran</p>
          <p className="mt-0.5 text-base font-extrabold text-orange-950 sm:text-lg">{rupiah(totalExpenses)}</p>
          <p className="text-[11px] text-slate-500">
            {totalSales > 0 ? `${((totalExpenses / totalSales) * 100).toFixed(1)}% dari omset` : "Beban operasional"}
          </p>
        </div>

        <div
          className={`rounded-xl border p-3 shadow-2xs ${
            netProfit >= 0 ? "border-emerald-100 bg-emerald-50/40" : "border-rose-100 bg-rose-50/40"
          }`}
        >
          <p
            className={`text-[11px] font-bold uppercase tracking-wider ${
              netProfit >= 0 ? "text-emerald-700" : "text-rose-700"
            }`}
          >
            Selisih Bersih (Net)
          </p>
          <p
            className={`mt-0.5 text-base font-extrabold sm:text-lg ${
              netProfit >= 0 ? "text-emerald-950" : "text-rose-950"
            }`}
          >
            {netProfit >= 0 ? `+${rupiah(netProfit)}` : rupiah(netProfit)}
          </p>
          <p className="text-[11px] text-slate-500 font-medium">
            {netProfit >= 0 ? `Surplus (${netMargin.toFixed(1)}%)` : `Defisit (${netMargin.toFixed(1)}%)`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Rasio Efisiensi</p>
          <p className="mt-0.5 text-base font-extrabold text-slate-900 sm:text-lg">
            {totalExpenses > 0 ? (totalSales / totalExpenses).toFixed(2) : "∞"}x
          </p>
          <p className="text-[11px] text-slate-500">Revenue to cost ratio</p>
        </div>
      </div>

      {/* SVG Canvas & Zero-Layout-Shift Floating Tooltip Container */}
      <div
        className="relative px-3 pb-4 pt-3 sm:px-6"
        onMouseLeave={() => setActiveIdx(null)}
      >
        {/* Floating Absolute Tooltip (Zero Layout Shift, pointer-events-none) */}
        {activeItem && (
          <div
            className="pointer-events-none absolute z-20 hidden sm:block transition-all duration-100 ease-out"
            style={{
              top: "14px",
              left: `clamp(180px, ${activeXPercent}%, calc(100% - 180px))`,
              transform: "translateX(-50%)"
            }}
          >
            <div className="rounded-xl border border-slate-800/90 bg-slate-900/95 px-3.5 py-2.5 text-white shadow-xl backdrop-blur-xs min-w-[220px]">
              <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 mb-1.5">
                <span className="font-bold text-xs text-emerald-400">
                  📅 {activeItem.label} ({activeItem.key})
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    activeItem.sales >= activeItem.expenses ? "bg-emerald-900/80 text-emerald-300" : "bg-rose-900/80 text-rose-300"
                  }`}
                >
                  {activeItem.sales >= activeItem.expenses ? "Surplus" : "Defisit"}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">📈 Penjualan:</span>
                  <b className="text-blue-300 font-extrabold">{rupiah(activeItem.sales || 0)}</b>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-400">📉 Pengeluaran:</span>
                  <b className="text-orange-300 font-extrabold">{rupiah(activeItem.expenses || 0)}</b>
                </div>
                <div className="flex justify-between gap-3 border-t border-slate-800 pt-1">
                  <span className="text-slate-400">💰 Selisih Net:</span>
                  <b
                    className={`font-extrabold ${
                      activeItem.sales >= activeItem.expenses ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {activeItem.sales >= activeItem.expenses
                      ? `+${rupiah(activeItem.sales - activeItem.expenses)}`
                      : rupiah(activeItem.sales - activeItem.expenses)}
                  </b>
                </div>
              </div>
            </div>
          </div>
        )}

        {rawMax === 0 ? (
          <div className="grid h-64 place-items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-500">
            <div className="text-center">
              <p className="text-2xl mb-1">📊</p>
              <p className="font-semibold text-slate-700">Belum ada data transaksi pada periode dashboard.</p>
              <p className="text-xs text-slate-400 mt-1">
                Data grafik akan otomatis muncul saat ada transaksi penjualan atau pengeluaran.
              </p>
            </div>
          </div>
        ) : (
          <div>
            <svg
              viewBox="0 0 500 230"
              className="h-64 sm:h-72 w-full select-none"
              role="img"
              aria-label="Grafik penjualan dan pengeluaran periode dashboard"
            >
              <defs>
                {/* Gradient for area fill under sales curve */}
                <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
                </linearGradient>

                {/* Gradient for expense bars */}
                <linearGradient id="expenseBarGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.85" />
                </linearGradient>
              </defs>

              {/* Y-Axis Horizontal Grid Lines and Financial Scale Labels */}
              {yTicks.map((tick, idx) => (
                <g key={`ytick-${idx}`}>
                  <line
                    x1={chartLeft - 5}
                    x2={chartRight}
                    y1={tick.yPos}
                    y2={tick.yPos}
                    stroke="#e2e8f0"
                    strokeDasharray={idx === yTicks.length - 1 ? undefined : "3 4"}
                    strokeWidth={idx === yTicks.length - 1 ? "1.5" : "1"}
                  />
                  <text
                    x={chartLeft - 10}
                    y={tick.yPos + 3.5}
                    textAnchor="end"
                    fontSize="9.5"
                    fontWeight="600"
                    fill="#64748b"
                  >
                    {rupiahCompact(tick.value)}
                  </text>
                </g>
              ))}

              {/* Expense Bars */}
              {data.map((item, index) => {
                const barH = chartBottom - y(item.expenses || 0);
                const isActive = activeIdx === index;
                return (
                  <rect
                    key={`expense-${item.key}`}
                    x={x(index) - barWidth / 2}
                    y={y(item.expenses || 0)}
                    width={barWidth}
                    height={Math.max(0, barH)}
                    rx="4"
                    fill="url(#expenseBarGradient)"
                    opacity={activeIdx !== null && !isActive ? 0.4 : 0.95}
                    className="transition-all duration-150"
                  />
                );
              })}

              {/* Area fill under sales curve */}
              {areaPath && <path d={areaPath} fill="url(#salesAreaGradient)" />}

              {/* Sales Polyline */}
              <polyline
                points={salesPoints}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Active Column Highlight Line */}
              {activeIdx !== null && (
                <line
                  x1={x(activeIdx)}
                  x2={x(activeIdx)}
                  y1={chartTop}
                  y2={chartBottom}
                  stroke="#3b82f6"
                  strokeDasharray="3 3"
                  strokeWidth="1.5"
                  opacity="0.8"
                />
              )}

              {/* Sales Data Points & Badges */}
              {data.map((item, index) => {
                const cx = x(index);
                const cy = y(item.sales || 0);
                const isActive = activeIdx === index;
                return (
                  <g key={`sale-pt-${item.key}`}>
                    {/* Outer pulse circle when active */}
                    {isActive && (
                      <circle cx={cx} cy={cy} r="9" fill="#93c5fd" opacity="0.5" className="animate-pulse" />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isActive ? "6" : "4.5"}
                      fill="#ffffff"
                      stroke="#2563eb"
                      strokeWidth={isActive ? "3.5" : "2.5"}
                      className="transition-all duration-150"
                    />
                  </g>
                );
              })}

              {/* X-Axis Month Labels */}
              {data.map((item, index) => {
                const isActive = activeIdx === index;
                return (
                  <text
                    key={`label-${item.key}`}
                    x={x(index)}
                    y="210"
                    textAnchor="middle"
                    fontSize={isActive ? "11.5" : "11"}
                    fontWeight={isActive ? "800" : "600"}
                    fill={isActive ? "#1e293b" : "#64748b"}
                    className="transition-all duration-150"
                  >
                    {item.label}
                  </text>
                );
              })}

              {/* Transparent Column Overlays for Interactive Hover with Full Hit-Testing */}
              {data.map((item, index) => (
                <rect
                  key={`hover-overlay-${item.key}`}
                  x={x(index) - columnWidth / 2}
                  y={chartTop - 10}
                  width={columnWidth}
                  height={chartHeight + 35}
                  fill="#ffffff"
                  fillOpacity="0.001"
                  style={{ pointerEvents: "all" }}
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveIdx(index)}
                  onClick={() => setActiveIdx(activeIdx === index ? null : index)}
                />
              ))}
            </svg>

            {/* Mobile Fallback Inspection Banner (When tapped on mobile screens) */}
            {activeItem && (
              <div className="mt-2 block sm:hidden rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <b className="text-slate-900">📅 {activeItem.label} ({activeItem.key})</b>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      activeItem.sales >= activeItem.expenses
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    Net: {rupiah(activeItem.sales - activeItem.expenses)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Omset: <b className="text-blue-700">{rupiah(activeItem.sales || 0)}</b></span>
                  <span>Beban: <b className="text-orange-700">{rupiah(activeItem.expenses || 0)}</b></span>
                </div>
              </div>
            )}

            {/* Instruction Tip */}
            <p className="mt-1 text-center text-[11px] text-slate-400">
              💡 Arahkan atau sentuh titik bulan untuk melihat rincian omset & beban.
            </p>
          </div>
        )}
      </div>

      {/* Collapsible Tabular Data Breakdown */}
      {showTable && (
        <div className="border-t border-slate-200 bg-slate-50/60 p-4 sm:p-6 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              📋 Rincian Lengkap Angka Keuangan per Periode
            </h4>
            <span className="text-xs text-slate-500">{data.length} periode tercatat</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100/80 font-bold text-slate-700">
                <tr>
                  <th className="px-4 py-3">Periode</th>
                  <th className="px-4 py-3 text-right">Penjualan (Omset)</th>
                  <th className="px-4 py-3 text-right">Pengeluaran (Beban)</th>
                  <th className="px-4 py-3 text-right">Selisih Bersih (Net)</th>
                  <th className="px-4 py-3 text-center">Margin / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((item, idx) => {
                  const net = (item.sales || 0) - (item.expenses || 0);
                  const marginPct = (item.sales || 0) > 0 ? (net / item.sales) * 100 : 0;
                  const isHovered = activeIdx === idx;
                  return (
                    <tr
                      key={item.key}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`transition-colors cursor-pointer ${
                        isHovered ? "bg-blue-50/60 font-semibold" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <span className="font-bold">{item.label}</span>
                        <span className="text-[11px] text-slate-400 ml-1.5">({item.key})</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-blue-700">
                        {rupiah(item.sales || 0)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-orange-700">
                        {rupiah(item.expenses || 0)}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-bold ${
                          net >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {net >= 0 ? `+${rupiah(net)}` : rupiah(net)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            net >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {net >= 0 ? `Surplus ${marginPct.toFixed(0)}%` : `Defisit ${marginPct.toFixed(0)}%`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-100/90 font-extrabold text-slate-900">
                <tr>
                  <td className="px-4 py-3">TOTAL KESELURUHAN</td>
                  <td className="px-4 py-3 text-right text-blue-950">{rupiah(totalSales)}</td>
                  <td className="px-4 py-3 text-right text-orange-950">{rupiah(totalExpenses)}</td>
                  <td
                    className={`px-4 py-3 text-right ${
                      netProfit >= 0 ? "text-emerald-950" : "text-rose-950"
                    }`}
                  >
                    {netProfit >= 0 ? `+${rupiah(netProfit)}` : rupiah(netProfit)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        netProfit >= 0 ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
                      }`}
                    >
                      {netMargin.toFixed(1)}% Margin
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
