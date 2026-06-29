import { redirect } from "next/navigation";
import { AuthLandingPage } from "@/components/auth/AuthLandingPage";
import { authenticatedLoginTarget, shouldRedirectAuthenticatedLogin } from "@/lib/auth/login";
import { getCurrentRole } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const role = await getCurrentRole();
  if (shouldRedirectAuthenticatedLogin(role)) redirect(authenticatedLoginTarget(role));
  return <AuthLandingPage currentRole={role} />;
}
