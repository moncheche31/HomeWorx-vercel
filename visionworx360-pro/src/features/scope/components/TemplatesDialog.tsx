import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useTemplatePreviewQuery } from "../hooks/useScope";
import type { ScopeSectionDTO } from "../types";
import type { useScopeMutations } from "../hooks/useScope";

type TemplateSummary = {
  id: string; name: string; description: string | null; isSystemTemplate: boolean;
};

/**
 * Template browser supporting three insertion granularities — whole template,
 * a single section, or a single item — all additive (never overwrites).
 */
export function TemplatesDialog({
  open, onOpenChange, projectId, templates, recommendedId, sections, roomId, mutations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  templates: TemplateSummary[];
  recommendedId: string | null;
  sections: ScopeSectionDTO[];
  roomId: string | null;
  mutations: ReturnType<typeof useScopeMutations>;
}) {
  const { t } = useTranslation("scope");
  const [previewId, setPreviewId] = useState<string | null>(recommendedId);
  const [targetSectionId, setTargetSectionId] = useState<string>(sections[0]?.id ?? "");
  const previewQ = useTemplatePreviewQuery(previewId ?? undefined);

  const sorted = useMemo(() => {
    const rec = templates.find((tpl) => tpl.id === recommendedId);
    const rest = templates.filter((tpl) => tpl.id !== recommendedId);
    return rec ? [rec, ...rest] : templates;
  }, [templates, recommendedId]);

  /**
   * A template written for another project type is never applied silently.
   * The first attempt surfaces the mismatch; the contractor decides.
   */
  const [mismatch, setMismatch] = useState<
    { project: string; template: string; retry: (confirm: true) => Promise<void> } | null
  >(null);

  /** Shared handler: any insertion granularity routes a mismatch to the same prompt. */
  const runInsert = async (
    run: (confirmMismatch: boolean) => Promise<void>,
    confirmMismatch: boolean,
  ) => {
    try {
      await run(confirmMismatch);
      setMismatch(null);
    } catch (e) {
      const message = (e as Error).message ?? "";
      if (message.startsWith("template_project_type_mismatch")) {
        const [, project, template] = message.split(":");
        setMismatch({
          project: project || "unknown",
          template: template || "unknown",
          retry: () => runInsert(run, true),
        });
        return;
      }
      toast.error(message || t("errors.generic"));
    }
  };

  const insertAll = async (confirmMismatch = false) => {
    if (!previewId) return;
    await runInsert(async (confirm) => {
      const res = await mutations.applyTemplate.mutateAsync({
        projectId, templateId: previewId, roomId, allowAppend: true, confirmMismatch: confirm,
      });
      toast.success(t("templates.appliedToast", {
        sections: res.sectionsCreated, items: res.itemsCreated,
      }));
      onOpenChange(false);
    }, confirmMismatch);
  };

  const insertSection = async (sectionIndex: number, confirmMismatch = false) => {
    if (!previewId) return;
    await runInsert(async (confirm) => {
      await mutations.insertTemplateSection.mutateAsync({
        projectId, templateId: previewId, sectionIndex, roomId, confirmMismatch: confirm,
      });
      toast.success(t("templates.insertedSection"));
    }, confirmMismatch);
  };

  const insertItem = async (sectionIndex: number, itemIndex: number, confirmMismatch = false) => {
    if (!previewId) return;
    if (!targetSectionId) { toast.error(t("templates.pickTargetSection")); return; }
    await runInsert(async (confirm) => {
      await mutations.insertTemplateItem.mutateAsync({
        projectId, templateId: previewId, sectionIndex, itemIndex,
        targetSectionId, roomId, confirmMismatch: confirm,
      });
      toast.success(t("templates.insertedItem"));
    }, confirmMismatch);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0">
        <DialogHeader>
          <DialogTitle>{t("templates.title")}</DialogTitle>
          <DialogDescription>{t("templates.granularHint")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="space-y-2">
            {sorted.map((tpl) => (
              <button
                key={tpl.id} type="button"
                aria-pressed={previewId === tpl.id}
                className={
                  "w-full rounded-md border p-3 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (previewId === tpl.id ? "border-primary" : "border-border")
                }
                onClick={() => setPreviewId(tpl.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.id === recommendedId && <Badge>{t("templates.recommended")}</Badge>}
                </div>
                {tpl.description && (
                  <p className="mt-1 text-xs text-foreground-muted">{tpl.description}</p>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[220px] rounded-md border border-border p-3">
            {!previewId && <p className="text-sm text-foreground-muted">{t("templates.preview")}</p>}
            {previewId && previewQ.isLoading && <LoadingSpinner />}
            {previewQ.data && (
              <div className="space-y-3">
                <div>
                  <h4 className="font-semibold">{previewQ.data.name}</h4>
                  <p className="text-xs text-foreground-muted">
                    {t("templates.sectionsCount", { count: previewQ.data.sections.length })}
                    {" · "}
                    {t("templates.itemsCount", {
                      count: previewQ.data.sections.reduce((n, s) => n + s.items.length, 0),
                    })}
                  </p>
                </div>

                {mismatch && (
                  <div className="rounded-md border border-warning bg-warning/10 p-3 text-xs">
                    <p className="font-medium">
                      {t("templates.mismatchTitle", {
                        template: mismatch.template.replace(/_/g, " "),
                        project: mismatch.project.replace(/_/g, " "),
                      })}
                    </p>
                    <p className="mt-1 text-foreground-muted">{t("templates.mismatchHint")}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" className="h-11" onClick={() => void mismatch.retry(true)}>
                        {t("templates.mismatchConfirm")}
                      </Button>
                      <Button
                        size="sm" variant="outline" className="h-11"
                        onClick={() => setMismatch(null)}
                      >
                        {t("templates.mismatchCancel")}
                      </Button>
                    </div>
                  </div>
                )}

                <Button className="h-11 w-full" onClick={() => void insertAll()}>
                  <LayoutTemplate className="mr-1 size-4" aria-hidden /> {t("templates.insertAll")}
                </Button>


                {sections.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-xs font-medium">{t("templates.targetSection")}</span>
                    <Select value={targetSectionId} onValueChange={setTargetSectionId}>
                      <SelectTrigger className="h-11" aria-label={t("templates.targetSection")}>
                        <SelectValue placeholder={t("templates.pickTargetSection")} />
                      </SelectTrigger>
                      <SelectContent>
                        {sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <ul className="space-y-3 text-sm">
                  {previewQ.data.sections.map((s) => (
                    <li key={s.index} className="rounded-md border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{s.name}</p>
                        <Button
                          size="sm" variant="secondary" className="h-9"
                          onClick={() => void insertSection(s.index)}
                        >
                          <Plus className="mr-1 size-3.5" aria-hidden /> {t("templates.insertSection")}
                        </Button>
                      </div>
                      <ul className="mt-1 space-y-1">
                        {s.items.map((it) => (
                          <li key={it.index} className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-foreground-muted">{it.title}</span>
                            <Button
                              size="sm" variant="ghost" className="h-9 shrink-0"
                              aria-label={t("templates.insertItem")}
                              title={t("templates.insertItem")}
                              disabled={sections.length === 0}
                              onClick={() => void insertItem(s.index, it.index)}
                            >
                              <Plus className="size-4" aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
