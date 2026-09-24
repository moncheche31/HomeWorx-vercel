import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, FolderKanban, Mic, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { key: "dashboard", to: "/app/dashboard", icon: LayoutDashboard },
  { key: "projects", to: "/app/projects", icon: FolderKanban },
  { key: "walkthrough", to: "/app/walkthrough", icon: Mic },
  { key: "profile", to: "/app/profile", icon: User },
] as const;

export function MobileBottomNav() {
  const { t } = useTranslation("workspace");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      data-app-chrome
      aria-label={t("nav.mobile")}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-2xl items-stretch justify-around">
        {items.map((item) => {
          const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex-1">
              <Link
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  isActive ? "text-primary" : "text-foreground-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{t(`nav.${item.key}`)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
