import { redirect } from "next/navigation";
import { landingPageForRole } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
  const user = await getCurrentUser();
  if (user.id === "unauthenticated") redirect("/login");
  const role = user.role;
  const landing = landingPageForRole(role);
  redirect(landing);
}
