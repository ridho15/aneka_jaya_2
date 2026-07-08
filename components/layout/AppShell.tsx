import type { ReactNode } from "react";
import { Header } from "./Header";
import { MobileNavigationDrawer } from "./MobileNavigationDrawer";
import { Sidebar } from "./Sidebar";
import { getCurrentUser } from "@/lib/auth/session";
import { shouldShowDemoLogout } from "@/lib/auth/demoUi";
import { resolveAuthProvider } from "@/lib/auth/request";
import { getUserProfile } from "@/lib/users/profile";

export async function AppShell({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const profile = await getUserProfile(user);
  const provider = resolveAuthProvider();
  return (
    <div className="min-h-screen lg:flex">
      <MobileNavigationDrawer role={user.role} userName={profile.name} />
      <Sidebar role={user.role} />
      <main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
        <Header user={profile} showDemoLogout={shouldShowDemoLogout()} showLogout={provider === "local_credentials" || provider === "anika_erp"} />
        {children}
      </main>
    </div>
  );
}
