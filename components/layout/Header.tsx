import type { Role } from "@/lib/auth/roles";
import { roleLabel } from "@/lib/auth/roles";
import { DemoLogoutButton } from "./DemoLogoutButton";

export function Header({ role, showDemoLogout = false }: { role: Role; showDemoLogout?: boolean }) {
  const date = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <header className="mb-8 flex flex-col gap-4 border-b border-neutral-300 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-neutral-500">Operasional internal</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-neutral-900">Aneka Jaya Internal App</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 sm:justify-end">
        <span className="hidden border-r border-neutral-200 pr-4 sm:block">{date}</span>
        <span className="hidden h-7 w-7 place-items-center rounded-full bg-neutral-100 text-sm font-bold text-neutral-700 sm:grid">A</span>
        <span className="font-semibold">{roleLabel(role)}</span>
        <span className="border border-neutral-300 bg-white px-2 py-1">{process.env.NEXT_PUBLIC_APP_MODE === "production" ? "Produksi" : "Development"}</span>
        {showDemoLogout ? <DemoLogoutButton /> : null}
      </div>
    </header>
  );
}
