import type { Metadata } from "next";
import { APP_BRAND_TITLE, APP_BRAND_NAME } from "@/lib/appBrand";
import { TopLoadingBar } from "@/components/ui/TopLoadingBar";
import { Suspense } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_BRAND_TITLE,
  description: `Aplikasi operasional internal ${APP_BRAND_NAME}`
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body suppressHydrationWarning><Suspense fallback={null}><TopLoadingBar /></Suspense>{children}</body></html>;
}
