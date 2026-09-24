import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useOrgActivityQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { useLocale } from "@/i18n/format";

export function OrgActivityFeed({ limit = 12 }: { limit?: number }) {
  const { t } = useTranslation(["workspace", "pw"]);
  const locale = useLocale();
  const q = useOrgActivityQuery(limit);

  const disabled = q.fetchStatus === "idle" && q.isPending;
  if (!disabled && (q.isPending || q.isLoading)) {
    return (
      <div className="py-6">
        <LoadingSpinner label={t("cards.activity.title")} />
      </div>
    );
  }
  if (q.isError) {
    return <RetryPanel title={t("pw:errors.generic")} onRetry={() => q.refetch()} />;
  }

  const items = q.data ?? [];
  if (disabled || items.length === 0) {
    return <EmptyState title={t("empty.noActivity")} description={t("cards.activity.empty")} />;
  }

  return (
    <ol className="space-y-2">
      {items.map((a) => {
        const actor = a.actorName ?? t("pw:activity.unknownActor");
        const verb = t(`pw:activity.types.${a.activityType}`, { defaultValue: a.activityType });
        const entity = t(`pw:activity.entities.${a.entityType}`, { defaultValue: a.entityType });
        return (
          <li key={a.id}>
            <Link
              to="/app/projects/$projectId"
              params={{ projectId: a.projectId }}
              className="flex min-h-11 flex-col gap-1 rounded-md border border-border bg-card p-3 text-sm transition-colors hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {a.projectName ?? t("cards.activity.unknownProject")}
                </p>
                <p className="text-foreground-muted">
                  <span className="font-medium text-foreground">{actor}</span> {verb} {entity}
                  {a.summary ? <span> — {a.summary}</span> : null}
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
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
