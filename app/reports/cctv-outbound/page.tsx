import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CctvOutboundRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = new URLSearchParams();
  next.set("tab", "outbound");

  for (const [key, raw] of Object.entries(params)) {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && key !== "tab") next.set(key, value);
  }

  redirect(`/reports/cctv?${next.toString()}`);
}
