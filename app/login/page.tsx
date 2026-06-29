import { redirect } from "next/navigation";
import { LoginPageShell } from "@/components/auth/LoginPageShell";
import { authenticatedLoginTarget, shouldRedirectAuthenticatedLogin } from "@/lib/auth/login";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user.id !== "unauthenticated" && shouldRedirectAuthenticatedLogin(user.role)) redirect(authenticatedLoginTarget(user.role));
  return <LoginPageShell />;
}
