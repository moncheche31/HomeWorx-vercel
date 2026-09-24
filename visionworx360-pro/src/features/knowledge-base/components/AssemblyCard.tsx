import { Star, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AssemblyDTO } from "../types";

/** Compact, touch-friendly row for one work item in the library list. */
export function AssemblyCard({
  assembly, onOpen, onToggleFavorite,
}: {
  assembly: AssemblyDTO;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  const { t } = useTranslation("knowledge-base");

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border border-border bg-surface p-3",
        assembly.isDisabled && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="min-h-11 flex-1 space-y-1 text-left"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">{assembly.workItem}</span>
          {assembly.origin === "organization" && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
              {t("badge.custom")}
            </Badge>
          )}
          {assembly.isCustomized && assembly.origin === "library" && (
            <Badge className="bg-accent px-1.5 py-0 text-[10px] uppercase text-accent-foreground">
              {t("badge.customized")}
            </Badge>
          )}
          {assembly.isDisabled && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] uppercase">
              {t("badge.disabled")}
            </Badge>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-foreground-muted">
          {assembly.defaultScopeDescription}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-foreground-muted">
          <span className="uppercase tracking-wide">{assembly.tradeKey.replace(/_/g, " ")}</span>
          <span>{t("fields.unit")}: {assembly.unitKey.replace(/_/g, " ")}</span>
          {assembly.defaultLaborHours != null && (
            <span>{t("fields.laborHours")}: {assembly.defaultLaborHours}</span>
          )}
          {assembly.useCount > 0 && <span>{t("detail.usage", { count: assembly.useCount })}</span>}
        </div>
      </button>
      <div className="flex flex-col gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11"
          aria-label={assembly.isFavorite ? t("actions.unfavorite") : t("actions.favorite")}
          aria-pressed={assembly.isFavorite}
          onClick={onToggleFavorite}
        >
          <Star className={cn("size-4", assembly.isFavorite && "fill-accent text-accent")} aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-11"
          aria-label={t("actions.edit")}
          onClick={onOpen}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
