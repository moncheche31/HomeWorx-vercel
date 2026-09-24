import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ESTIMATE_COPY_OPTIONS,
  type EstimateCopyOptions,
} from "@/domains/estimating/copyPlan";
import { useCopySourcesQuery, useEstimateCopyMutations } from "../hooks/useEstimateCopy";

const OPTION_KEYS = [
  "copyScope",
  "copyLines",
  "copyQuantities",
  "copyPricing",
  "copyMarkup",
  "copyAssumptions",
] as const satisfies readonly (keyof EstimateCopyOptions)[];

/**
 * Explicit, contractor-controlled template pick. Nothing from a prior project
 * can reach this project without a selection here plus a confirmation.
 */
export function CopyFromProjectDialog({
  projectId,
  open,
  onOpenChange,
  onCopied,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopied?: (estimateId: string) => void;
}) {
  const { t } = useTranslation("estimating");
  const [search, setSearch] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [options, setOptions] = useState<EstimateCopyOptions>(DEFAULT_ESTIMATE_COPY_OPTIONS);

  const sourcesQ = useCopySourcesQuery({ search, excludeProjectId: projectId, enabled: open });
  const { copyFromProject } = useEstimateCopyMutations(projectId);
  const sources = useMemo(() => sourcesQ.data ?? [], [sourcesQ.data]);

  const submit = async () => {
    if (!sourceId || copyFromProject.isPending) return;
    try {
      const res = await copyFromProject.mutateAsync({ sourceEstimateId: sourceId, options });
      toast.success(res.created ? t("copy.toast.copied") : t("copy.toast.existing"));
      onCopied?.(res.estimateId);
      onOpenChange(false);
    } catch {
      toast.error(t("copy.toast.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("copy.title")}</DialogTitle>
          <DialogDescription>{t("copy.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("copy.searchPlaceholder")}
              className="min-h-(--control-min-h) pl-9"
              aria-label={t("copy.searchPlaceholder")}
            />
          </div>

          {sourcesQ.isLoading ? (
            <div className="py-6">
              <LoadingSpinner label="…" />
            </div>
          ) : sources.length === 0 ? (
            <EmptyState title={t("copy.none.title")} description={t("copy.none.description")} />
          ) : (
            <ul className="space-y-2" role="listbox" aria-label={t("copy.title")}>
              {sources.map((s) => {
                const selected = s.estimateId === sourceId;
                return (
                  <li key={s.estimateId}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setSourceId(s.estimateId)}
                      className={cn(
                        "flex w-full flex-col items-start gap-1 rounded-md border p-3 text-left",
                        "min-h-(--control-min-h) transition-colors",
                        selected ? "border-primary bg-accent" : "hover:bg-muted",
                      )}
                    >
                      <span className="font-medium">{s.projectName}</span>
                      <span className="text-xs text-muted-foreground">
                        {[s.clientReference, s.projectType].filter(Boolean).join(" · ")}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{s.estimateStatus}</Badge>
                        {s.estimateTitle}
                        {s.estimateDatedAt ? ` · ${s.estimateDatedAt.slice(0, 10)}` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{t("copy.options.legend")}</legend>
            {OPTION_KEYS.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`copy-${key}`}
                  checked={options[key]}
                  onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: v === true }))}
                />
                <Label htmlFor={`copy-${key}`} className="text-sm font-normal">
                  {t(`copy.options.${key}`)}
                </Label>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">{t("copy.options.excluded")}</p>
          </fieldset>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-(--control-min-h)"
            onClick={() => onOpenChange(false)}
          >
            {t("copy.cancel")}
          </Button>
          <Button
            type="button"
            className="min-h-(--control-min-h)"
            disabled={!sourceId || copyFromProject.isPending}
            onClick={submit}
          >
            <Copy className="mr-2 size-4" aria-hidden />
            {t("copy.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
