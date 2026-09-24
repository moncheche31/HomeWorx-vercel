import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowLeftRight, ArrowUpDown, Minus, Plus, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SCALE_TARGETS,
  SCALE_TARGET_LABELS,
  TARGET_AXIS,
  candidateFor,
  suggestedReferencesForAxis,
  scaleReferenceFor,
  type PhotoScaleObservation,
  type ScaleTarget,
} from "@/domains/ballpark";

interface Props {
  roomType: string | null;
  photoIds: string[];
  observations: PhotoScaleObservation[];
  onChange: (next: PhotoScaleObservation[]) => void;
  /** Cabinet runs are only offered once cabinets are confirmed. */
  allowCabinetRun?: boolean;
}

const STEP = 0.5;

/**
 * Advanced calibration: turn a recognizable object into an approximate run.
 *
 * This is a power tool, not the normal path. It is only reachable behind
 * "Advanced calibration", and it now enforces the rule that was missing: each
 * run only offers rulers that lie on its own axis. You cannot pick a door
 * *height* to measure how wide a room is, because a door height says nothing
 * about width — that mistake is what produced 6.7 ft garages.
 */
export function ScaleReferenceCapture({
  roomType,
  photoIds,
  observations,
  onChange,
  allowCabinetRun = false,
}: Props) {
  const { t } = useTranslation("ballpark");
  const photoId = photoIds[0] ?? "photo-1";
  const targets = SCALE_TARGETS.filter((target) => target !== "cabinetRunLf" || allowCabinetRun);

  const forTarget = (target: ScaleTarget) => observations.find((o) => o.target === target) ?? null;

  const update = (target: ScaleTarget, patch: Partial<PhotoScaleObservation>) => {
    const existing = forTarget(target);
    const axisReferences = suggestedReferencesForAxis(roomType, TARGET_AXIS[target]);
    const next: PhotoScaleObservation = {
      photoId: existing?.photoId ?? photoId,
      /* The default is always a same-axis ruler. Never a door height for width. */
      referenceKey: existing?.referenceKey ?? axisReferences[0]?.key ?? "interiorDoorWidth",
      target,
      spans: existing?.spans ?? 1,
      ...patch,
    };
    onChange([...observations.filter((o) => o.target !== target), next]);
  };

  const clear = (target: ScaleTarget) => {
    onChange(observations.filter((o) => o.target !== target));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="size-4 text-primary" aria-hidden />
          {t("scale.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("scale.hint")}</p>

        {targets.map((target) => {
          const observation = forTarget(target);
          const axis = TARGET_AXIS[target];
          const references = suggestedReferencesForAxis(roomType, axis);
          const reference = observation ? scaleReferenceFor(observation.referenceKey) : null;
          const inches = reference && observation ? observation.spans * reference.nominalIn : 0;
          const outcome = observation ? candidateFor(observation) : null;
          const rejectedKey = outcome && !outcome.ok ? outcome.messageKey : null;
          const AxisIcon = axis === "horizontal" ? ArrowLeftRight : ArrowUpDown;

          return (
            <div key={target} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">{t(SCALE_TARGET_LABELS[target])}</Label>
                {observation ? (
                  <Button
                    variant="ghost"
                    className="min-h-(--control-min-h-sm) px-3 text-xs"
                    onClick={() => clear(target)}
                  >
                    {t("scale.clear")}
                  </Button>
                ) : null}
              </div>

              {/* Every run states its axis and exactly what to count. */}
              <p className="flex items-start gap-2 text-xs text-foreground-muted">
                <AxisIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {t(`scale.axisGuide.${target}`)}
              </p>

              <Select
                value={observation?.referenceKey ?? ""}
                onValueChange={(value) => update(target, { referenceKey: value })}
              >
                <SelectTrigger className="min-h-(--control-min-h)">
                  <SelectValue placeholder={t("scale.pickReference")} />
                </SelectTrigger>
                <SelectContent>
                  {references.map((ref) => (
                    <SelectItem key={ref.key} value={ref.key}>
                      {t(ref.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {observation ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-h-(--control-min-h) min-w-12"
                    aria-label={t("scale.less")}
                    onClick={() =>
                      update(target, { spans: Math.max(STEP, observation.spans - STEP) })
                    }
                  >
                    <Minus className="size-5" aria-hidden />
                  </Button>
                  <p className="text-center text-sm">
                    <span className="block font-semibold text-foreground">
                      {t(`scale.spansAxis.${axis}`, { count: observation.spans })}
                    </span>
                    <span className="block text-xs text-foreground-muted">
                      {t("scale.approx", { feet: Math.round((inches / 12) * 10) / 10 })}
                    </span>
                  </p>
                  <Button
                    variant="outline"
                    size="icon"
                    className="min-h-(--control-min-h) min-w-12"
                    aria-label={t("scale.more")}
                    onClick={() => update(target, { spans: observation.spans + STEP })}
                  >
                    <Plus className="size-5" aria-hidden />
                  </Button>
                </div>
              ) : null}

              {rejectedKey ? (
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  {t(rejectedKey)}
                </p>
              ) : null}

              {/* Cross-axis is possible in rare perspectives, never by default. */}
              {observation && reference && reference.axis !== axis && !reference.isElevation ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                  <Label htmlFor={`cross-${target}`} className="text-xs text-foreground-muted">
                    {t("scale.allowCrossAxis")}
                  </Label>
                  <Switch
                    id={`cross-${target}`}
                    checked={Boolean(observation.allowCrossAxis)}
                    onCheckedChange={(checked) => update(target, { allowCrossAxis: checked })}
                  />
                </div>
              ) : null}
            </div>
          );
        })}

        <p className="rounded-lg border border-border p-3 text-xs text-foreground-muted">
          {t("scale.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}
