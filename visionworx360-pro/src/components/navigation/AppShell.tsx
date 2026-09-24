import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Home, LayoutDashboard, Palette } from "lucide-react";
import { CompactBrand } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";

interface NavItem {
  labelKey: string;
  to: string;
  icon: typeof Home;
}

const defaultItems: NavItem[] = [
  { labelKey: "home", to: "/", icon: Home },
  { labelKey: "designSystem", to: "/design-system", icon: Palette },
  { labelKey: "status", to: "/system-status", icon: LayoutDashboard },
];

/** Desktop navigation shell — persistent top bar, left rail links. */
export function DesktopNavShell({
  items = defaultItems,
  children,
}: {
  items?: NavItem[];
  children: ReactNode;
}) {
  const { t } = useTranslation("navigation");
  return (
    <div className="hidden min-h-dvh md:flex">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex h-14 items-center border-b border-border px-4">
          <CompactBrand />
        </div>
        <nav aria-label={t("primary")} className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-foreground hover:bg-secondary"
              activeProps={{ className: "bg-secondary text-primary" }}
            >
              <item.icon className="size-4" aria-hidden />
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Mobile navigation shell — top bar + bottom tab bar with safe-area. */
export function MobileNavShell({
  items = defaultItems,
  children,
}: {
  items?: NavItem[];
  children: ReactNode;
}) {
  const { t } = useTranslation("navigation");
  return (
    <div className="flex min-h-dvh flex-col md:hidden">
      <header className="safe-top sticky top-0 z-30 flex h-14 items-center border-b border-border bg-surface/95 px-4 backdrop-blur">
        <CompactBrand />
      </header>
      <main className="flex-1 pb-20">{children}</main>
      <nav
        aria-label={t("primary")}
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface"
      >
        <ul className="mx-auto flex max-w-2xl items-stretch justify-around">
          {items.map((item) => (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground-muted",
                )}
                activeProps={{ className: "text-primary" }}
              >
                <item.icon className="size-5" aria-hidden />
                <span>{t(item.labelKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Mobile bottom action bar — sticky primary action(s) at screen bottom. */
export function MobileBottomActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-4 pt-3 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto flex max-w-2xl items-center gap-2">{children}</div>
    </div>
  );
}
