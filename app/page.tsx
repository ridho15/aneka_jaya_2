import { redirect } from "next/navigation";
import { AuthLandingPage } from "@/components/auth/AuthLandingPage";
import { landingPageForRole } from "@/lib/auth/roles";
import { getCurrentRole } from "@/lib/auth/session";

export default async function Home() {
  const role = await getCurrentRole();
  const landing = landingPageForRole(role);
  if (landing !== "/no-access") redirect(landing);
  return <AuthLandingPage currentRole={role} />;
}
