import { useTranslation } from "react-i18next";
import { Bell, Check } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { EmptyState } from "@/components/feedback/EmptyState";
import { cn } from "@/lib/utils";

export function NotificationsPanel() {
  const { t } = useTranslation("workspace");
  const { notifications, unreadCount, markAllRead, markRead } = useWorkspace();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("header.notifications")}
          className="relative min-h-11 min-w-11"
        >
          <Bell className="size-5" aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-label={t("notifications.unreadBadge", { count: unreadCount })}
              className="absolute right-1.5 top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-danger-foreground"
            >
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t("notifications.title")}</h2>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {t("notifications.unreadBadge", { count: unreadCount })}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="h-8"
          >
            <Check className="mr-1 size-3.5" aria-hidden />
            {t("notifications.markAllRead")}
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title={t("notifications.empty")}
                description={t("notifications.emptyHint")}
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className={cn(
                      "flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-secondary/60",
                      !n.readAt && "bg-primary/5",
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      {!n.readAt && (
                        <span
                          aria-hidden
                          className="inline-block size-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span className="truncate text-sm font-medium text-foreground">
                        {n.title}
                      </span>
                    </div>
                    {n.body && <span className="text-xs text-foreground-muted">{n.body}</span>}
                    <span className="text-[11px] uppercase tracking-wide text-foreground-muted">
                      {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
