import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  FolderKanban,
  BookOpen,
  BookMarked,
  Calculator,
  FileText,
  Image as ImageIcon,
  Send,
  Users,
  Home,
  Calendar,
  FolderOpen,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { CompactBrand } from "@/components/brand/BrandMark";
import { cn } from "@/lib/utils";

interface Item {
  key: string;
  to: string;
  icon: LucideIcon;
  active: boolean;
}

const items: Item[] = [
  { key: "dashboard", to: "/app/dashboard", icon: LayoutDashboard, active: true },
  { key: "projects", to: "/app/projects", icon: FolderKanban, active: true },
  { key: "knowledgeBase", to: "/app/knowledge-base", icon: BookOpen, active: true },
  { key: "costBook", to: "/app/cost-book", icon: Calculator, active: true },
  { key: "terminology", to: "/app/terminology", icon: BookMarked, active: true },
  { key: "estimates", to: "/app/estimates", icon: FileText, active: false },
  { key: "renderings", to: "/app/renderings", icon: ImageIcon, active: false },
  { key: "proposals", to: "/app/proposals", icon: Send, active: true },
  { key: "customers", to: "/app/clients", icon: Users, active: true },
  { key: "properties", to: "/app/properties", icon: Home, active: true },

  { key: "calendar", to: "/app/calendar", icon: Calendar, active: false },
  { key: "files", to: "/app/files", icon: FolderOpen, active: false },
  { key: "reports", to: "/app/reports", icon: BarChart3, active: false },
  { key: "settings", to: "/app/settings", icon: Settings, active: true },
];

export function AppSidebar() {
  const { t } = useTranslation("workspace");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      data-app-chrome
      aria-label={t("nav.primary")}
      className="hidden shrink-0 border-r border-border bg-surface md:flex md:w-60 md:flex-col"
    >
      <div className="flex h-14 items-center border-b border-border px-4">
        <CompactBrand />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.filter((item) => item.active).map((item) => {
          const isActive = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.key}
              to={item.to}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                isActive ? "bg-secondary text-primary" : "text-foreground hover:bg-secondary/70",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{t(`nav.${item.key}`)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
