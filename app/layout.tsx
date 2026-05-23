import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/context";

export const metadata: Metadata = {
  title: "HomeWorx — Contractor Estimator",
  description: "On-site estimate tool for contractors. Voice input, AI pricing, PDF export.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "HomeWorx" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1d4ed8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
