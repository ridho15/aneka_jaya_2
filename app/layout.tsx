import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Aneka Jaya Internal App",
  description: "Aplikasi operasional internal Aneka Jaya"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body suppressHydrationWarning>{children}</body></html>;
}
