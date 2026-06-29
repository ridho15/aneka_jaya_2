import type { ReactNode } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { getCurrentRole } from "@/lib/auth/session";
import { shouldShowDemoLogout } from "@/lib/auth/demoUi";

export async function AppShell({ children }: { children: ReactNode }) {
  const role = await getCurrentRole();
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar role={role} />
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <Header role={role} showDemoLogout={shouldShowDemoLogout()} />
        {children}
      </main>
    </div>
  );
}
