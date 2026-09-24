import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ruler, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { planQuantityPropagation, type LineLike } from "@/domains/geometry";
import { useMeasurementMutations, useProjectGeometry } from "../hooks/useMeasurements";
import { MeasurementsDialog } from "./MeasurementsDialog";
import type { EstimateDTO, EstimateLineDTO } from "../types";

const toLineLike = (line: EstimateLineDTO): LineLike => ({
  id: line.id,
  description: line.description,
  unitKey: line.unitKey,
  categoryKey: line.categoryKey,
  tradeKey: line.tradeKey,
  quantity: line.quantity,
  isQuantityPlaceholder: line.isQuantityPlaceholder,
  isPriceOverridden: line.isPriceOverridden,
  quantityReviewedAt: line.quantityReviewedAt,
  archivedAt: line.archivedAt,
});

/**
 * One shared geometry record drives every dependent quantity. This panel shows
 * what can be filled in automatically and applies it in a single action, so the
 * contractor never walks the estimate line by line to type measurements.
 */
export function GeometryQuantitiesPanel({
  projectId, estimate, lines, readOnly,
}: {
  projectId: string;
  estimate: EstimateDTO;
  lines: EstimateLineDTO[];
  readOnly?: boolean;
}) {
  const { t } = useTranslation("estimating");
  const { record } = useProjectGeometry(projectId);
  const m = useMeasurementMutations(projectId, estimate.id);
  const [dialogOpen, setDialogOpen] = useState(false);

  const plan = useMemo(() => {
    if (!record) return null;
    return planQuantityPropagation({
      geometry: {
        roomId: null,
        label: record.label ?? null,
        lengthFt: record.lengthFt,
        widthFt: record.widthFt,
        ceilingHeightFt: record.ceilingHeightFt,
        openings: record.openings ?? [],
        interiorPartitionLf: record.interiorPartitionLf,
        floorWastePct: record.floorWastePct,
      },
      lines: lines.map(toLineLike),
    });
  }, [record, lines]);

  const surfaceLabel = (role: string) => t(`geometry.surface.${role}`, { defaultValue: "" });

  const apply = async () => {
    if (!plan || plan.derived.length === 0) return;
    const assignments = plan.derived.map((d) => {
      const multi = d.surfaces.length > 1;
      const head = d.surfaces[0];
      return {
        lineId: d.lineId,
        quantity: d.quantity,
        unitKey: d.unitKey,
        description: multi
          ? `${d.description} — ${surfaceLabel(head.role)}`
          : undefined,
        provenance: d.provenance as unknown as Record<string, unknown>,
        expansions: multi
          ? d.surfaces.slice(1).map((s) => ({
              role: s.role,
              description: `${d.description} — ${surfaceLabel(s.role)}`,
              quantity: s.quantity,
              unitKey: s.unitKey,
              provenance: {
                ...(d.provenance as unknown as Record<string, unknown>),
                measurementKey: s.measurementKey,
                formula: s.formula,
              },
            }))
          : undefined,
      };
    });

    try {
      const res = await m.applyQuantities.mutateAsync({ estimateId: estimate.id, assignments });
      toast.success(t("geometry.toast.applied", { updated: res.updated, added: res.inserted }));
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 px-3 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Ruler className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{t("geometry.panel.title")}</p>
            {!record ? (
              <p>{t("geometry.panel.empty")}</p>
            ) : (
              <p>
                {t("geometry.panel.dimensions", {
                  length: record.lengthFt ?? "?",
                  width: record.widthFt ?? "?",
                  height: record.ceilingHeightFt ?? "?",
                })}
              </p>
            )}
            {plan && plan.derived.length > 0 ? (
              <p>{t("geometry.panel.derivedCount", { count: plan.derived.length })}</p>
            ) : null}
            {plan && plan.blocked.length > 0 ? (
              <p className="text-foreground">
                {t("geometry.panel.blocked", { count: plan.blocked.length })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto"
            onClick={() => setDialogOpen(true)}
          >
            <Ruler className="mr-1 size-4" aria-hidden />
            {record ? t("geometry.actions.review") : t("geometry.actions.enter")}
          </Button>
          <Button
            className="h-11 w-full sm:w-auto"
            disabled={
              Boolean(readOnly) || !plan || plan.derived.length === 0 || m.applyQuantities.isPending
            }
            onClick={apply}
          >
            <Wand2 className="mr-1 size-4" aria-hidden />
            {m.applyQuantities.isPending
              ? t("geometry.actions.applying")
              : t("geometry.actions.apply", { count: plan?.derived.length ?? 0 })}
          </Button>
        </div>
      </div>

      {plan && plan.derived.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2 text-sm">
          {plan.derived.map((d) => (
            <li key={d.lineId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{d.description}</span>
              <span className="flex flex-wrap items-center gap-2">
                {d.surfaces.map((s) => (
                  <Badge key={`${d.lineId}-${s.role}`} variant="secondary">
                    {s.role !== "primary" ? `${surfaceLabel(s.role)}: ` : ""}
                    {s.quantity} {t(`geometry.unit.${s.unitKey}`)}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">{d.formula}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <MeasurementsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={projectId}
        estimateId={estimate.id}
        record={record}
      />
    </div>
  );
}
