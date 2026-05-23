"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, Settings } from "lucide-react";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";

export default function Navbar() {
  const pathname = usePathname();
  const { lang, setLang } = useLang();
  const t = useT(lang);

  const navItems = [
    { href: "/", icon: LayoutDashboard, label: t.dashboard },
    { href: "/estimate/new", icon: PlusCircle, label: t.newEstimate },
    { href: "/settings", icon: Settings, label: t.settings },
  ];

  return (
    <>
      {/* Top bar */}
      <header className="bg-blue-700 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-xl tracking-tight">
            🏠 {t.appName}
          </span>
          <button
            onClick={() => setLang(lang === "en" ? "es" : "en")}
            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
            aria-label="Toggle language"
          >
            {lang === "en" ? "🇺🇸 EN" : "🇲🇽 ES"}
          </button>
        </div>
      </header>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-50 shadow-xl">
        <div className="max-w-lg mx-auto flex">
          {navItems.map(({ href, icon: Icon, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  active ? "text-blue-700" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span className={`text-[10px] font-medium ${active ? "font-semibold" : ""}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
        {/* Safe area spacer for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </nav>
    </>
  );
}
