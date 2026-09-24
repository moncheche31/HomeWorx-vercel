import { useTranslation } from "react-i18next";
import { useActivityQuery } from "../hooks/useProjectWorkspace";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { useLocale } from "@/i18n/format";

export function ProjectActivityFeed({ projectId }: { projectId: string }) {
  const { t } = useTranslation("pw");
  const locale = useLocale();
  const q = useActivityQuery(projectId);

  if (q.isLoading) return <LoadingSpinner label="" />;
  if (q.isError)
    return <RetryPanel title={t("errors.generic")} onRetry={() => q.refetch()} />;
  const items = q.data ?? [];
  if (!items.length)
    return <EmptyState title={t("activity.empty")} description={t("activity.emptyDescription")} />;

  return (
    <ol className="space-y-2">
      {items.map((a) => {
        const actor = a.actorName ?? t("activity.unknownActor");
        const verb = t(`activity.types.${a.activityType}`, { defaultValue: a.activityType });
        const entity = t(`activity.entities.${a.entityType}`, { defaultValue: a.entityType });
        return (
          <li
            key={a.id}
            className="flex items-baseline justify-between gap-4 rounded-md border border-border bg-card p-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate">
                <span className="font-medium">{actor}</span>{" "}
                <span className="text-foreground-muted">
                  {verb} {entity}
                </span>
                {a.summary ? <span className="text-foreground-muted"> — {a.summary}</span> : null}
              </p>
            </div>
            <time
              className="shrink-0 text-xs text-foreground-muted"
              dateTime={a.createdAt}
              title={new Date(a.createdAt).toLocaleString(locale)}
            >
              {new Date(a.createdAt).toLocaleString(locale, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
