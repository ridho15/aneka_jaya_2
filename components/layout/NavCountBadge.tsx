import type { NavBadge } from "@/lib/layout/navBadges";

export function NavCountBadge({ badge, active }: { badge?: NavBadge; active: boolean }) {
  if (!badge?.count) return null;
  return (
    <span
      title={badge.title}
      className={`ml-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
        active ? "bg-white text-emerald-800" : "bg-rose-600 text-white"
      }`}
    >
      {badge.count > 99 ? "99+" : badge.count}
      <span className="sr-only"> ({badge.title})</span>
    </span>
  );
}
