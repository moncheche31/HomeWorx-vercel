import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useAssemblyTemplatesQuery, useKnowledgeBaseMutations } from "../hooks/useKnowledgeBase";

/**
 * Assembly template list. When `projectId` is supplied each template can be
 * inserted into that project's scope (always additive).
 */
export function AssemblyTemplateList({
  projectId, roomId = null, onApplied,
}: {
  projectId?: string;
  roomId?: string | null;
  onApplied?: () => void;
}) {
  const { t } = useTranslation("knowledge-base");
  const query = useAssemblyTemplatesQuery();
  const mutations = useKnowledgeBaseMutations();

  const apply = async (templateId: string) => {
    if (!projectId) return;
    try {
      const res = await mutations.applyTemplate.mutateAsync({ projectId, templateId, roomId });
      toast.success(t("templates.applied", { sections: res.sectionsCreated, items: res.itemsCreated }));
      onApplied?.();
    } catch (e) { toast.error((e as Error).message || t("toast.error")); }
  };

  if (query.isLoading) {
    return <div className="flex justify-center py-10"><LoadingSpinner /></div>;
  }
  const templates = query.data ?? [];
  if (templates.length === 0) {
    return <p className="py-10 text-center text-sm text-foreground-muted">{t("templates.empty")}</p>;
  }

  return (
    <ul className="space-y-2">
      {templates.map((tpl) => (
        <li key={tpl.id} className="rounded-lg border border-border bg-surface p-3">
          <div className="flex items-start gap-2">
            <LayoutTemplate className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">{tpl.name}</span>
                {tpl.isSystemTemplate && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
                    {t("templates.system")}
                  </Badge>
                )}
              </div>
              {tpl.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">{tpl.description}</p>
              )}
              <p className="mt-1 text-[11px] text-foreground-muted">
                {t("templates.items", { count: tpl.itemCount })}
              </p>
            </div>
          </div>
          {projectId && (
            <Button
              className="mt-2 min-h-11 w-full"
              variant="outline"
              onClick={() => apply(tpl.id)}
              disabled={mutations.applyTemplate.isPending}
            >
              {t("templates.apply")}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
