import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/context";

export const metadata: Metadata = {
  title: "HomeWorx 360 Estimator",
  description: "Professional on-site estimating tool for contractors. Voice input, AI-powered pricing, and beautiful PDF proposals — in English and Spanish.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HomeWorx 360",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0B3C5D",
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
