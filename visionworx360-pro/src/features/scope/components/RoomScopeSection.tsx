import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useScopeItemsQuery, useScopeSectionsQuery } from "../hooks/useScope";

export function RoomScopeSection({ projectId, roomId }: { projectId: string; roomId: string }) {
  const { t } = useTranslation("scope");
  const sectionsQ = useScopeSectionsQuery(projectId, roomId);
  const itemsQ = useScopeItemsQuery(projectId, { roomId });

  return (
    <section aria-labelledby="room-scope" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id="room-scope" className="text-lg font-semibold">{t("roomScope.title")}</h2>
        <Link
          to="/app/projects/$projectId"
          params={{ projectId }}
          className="text-sm text-primary hover:underline"
        >
          {t("roomScope.openInProject")}
        </Link>
      </div>
      {(sectionsQ.isLoading || itemsQ.isLoading) && <LoadingSpinner />}
      {sectionsQ.data && sectionsQ.data.length === 0 && (
        <EmptyState title={t("roomScope.empty")} />
      )}
      {sectionsQ.data && sectionsQ.data.length > 0 && (
        <div className="space-y-3">
          {sectionsQ.data.map((sec) => {
            const items = (itemsQ.data ?? []).filter((i) => i.sectionId === sec.id);
            return (
              <div key={sec.id} className="rounded-md border border-border p-3">
                <p className="font-medium">{sec.name}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2">
                      <span className={it.isIncluded ? "" : "line-through text-foreground-muted"}>
                        {it.title}
                      </span>
                      {it.tradeKey && (
                        <Badge variant="secondary">{t(`trades.${it.tradeKey}`, it.tradeKey)}</Badge>
                      )}
                    </li>
                  ))}
                  {items.length === 0 && (
                    <li className="text-xs text-foreground-muted">{t("items.empty")}</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
