import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MeasurementInput } from "@/components/inputs/MeasurementInput";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatFeet, parseLengthToFeet } from "@/domains/measurement";
import { deriveRoomGeometry, OPENING_PRESETS, type RoomGeometryInput } from "@/domains/geometry";
import { useMeasurementMutations } from "../hooks/useMeasurements";
import { useProjectScopeContext } from "../hooks/useProjectScopeContext";
import { useProjectMediaUnderstanding } from "@/features/remote-vision/hooks/useProjectMediaUnderstanding";
import { visualObservationsToScopeText } from "@/features/remote-vision/services/mediaUnderstanding.shared";
import type { ProjectMeasurementDTO } from "../measurementTypes";

/**
 * Counts and percentages are plain numbers. LENGTHS are not: they go through
 * the shared imperial parser so `94 in` and `7' 10"` are first-class here too.
 */
const numberOrNull = (v: string): number | null => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const lengthOrNull = (v: string): number | null =>
  parseLengthToFeet(v, { allowZero: true });

const countOf = (record: ProjectMeasurementDTO | null, kind: "door" | "window") =>
  String(record?.openings?.filter((o) => o.kind === kind).reduce((s, o) => s + o.count, 0) ?? 0);

/**
 * Enter the core dimensions ONCE. Every dependent quantity in the estimate is
 * derived from this record, so the contractor never retypes a length again.
 */
export function MeasurementsDialog({
  open, onOpenChange, projectId, estimateId, record,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  estimateId?: string;
  record: ProjectMeasurementDTO | null;
}) {
  const { t } = useTranslation("estimating");
  const m = useMeasurementMutations(projectId, estimateId);

  /**
   * Measurement fields come from the CURRENT project's scope, never from a
   * fixed room-conversion form. A cabinet job asks for nothing generic: its
   * run length is already a confirmed work quantity.
   */
  const mediaUnderstanding = useProjectMediaUnderstanding(projectId);
  const multimodalEvidence = useMemo(
    () => ({
      spokenNarration: mediaUnderstanding.spokenNarration,
      visualObservations: visualObservationsToScopeText(mediaUnderstanding.visualObservations),
    }),
    [mediaUnderstanding.spokenNarration, mediaUnderstanding.visualObservations],
  );
  const scope = useProjectScopeContext(projectId, multimodalEvidence);
  const shows = (field: string) =>
    (scope.measurementFields as string[]).includes(field);
  const showsAnyField = scope.measurementFields.length > 0;

  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [doors, setDoors] = useState("0");
  const [windows, setWindows] = useState("0");
  const [partitions, setPartitions] = useState("");
  const [waste, setWaste] = useState("10");

  useEffect(() => {
    if (!open) return;
    setLength(record?.lengthFt != null ? formatFeet(record.lengthFt) : "");
    setWidth(record?.widthFt != null ? formatFeet(record.widthFt) : "");
    setHeight(record?.ceilingHeightFt != null ? formatFeet(record.ceilingHeightFt) : "");
    setDoors(countOf(record, "door"));
    setWindows(countOf(record, "window"));
    setPartitions(record?.interiorPartitionLf != null ? formatFeet(record.interiorPartitionLf) : "");
    setWaste(record?.floorWastePct != null ? String(record.floorWastePct) : "10");
  }, [open, record]);

  const input: RoomGeometryInput = useMemo(() => {
    const doorCount = Number(doors) || 0;
    const windowCount = Number(windows) || 0;
    return {
      roomId: null,
      label: null,
      lengthFt: lengthOrNull(length),
      widthFt: lengthOrNull(width),
      ceilingHeightFt: lengthOrNull(height),
      openings: [
        ...(doorCount > 0 ? [{ kind: "door" as const, count: doorCount, ...OPENING_PRESETS.door }] : []),
        ...(windowCount > 0
          ? [{ kind: "window" as const, count: windowCount, ...OPENING_PRESETS.window }]
          : []),
      ],
      interiorPartitionLf: lengthOrNull(partitions),
      floorWastePct: numberOrNull(waste) ?? 10,
    };
  }, [length, width, height, doors, windows, partitions, waste]);

  const geometry = useMemo(() => deriveRoomGeometry(input), [input]);

  const PREVIEW_KEYS = [
    "floor_area", "ceiling_area", "perimeter", "wall_gross_area", "wall_net_area", "trim_lf",
  ] as const;
  /* Room-derived previews only make sense when room geometry is in scope. */
  const preview = (shows("lengthFt") && shows("widthFt") ? PREVIEW_KEYS : [])
    .map((key) => geometry.measurements[key])
    .filter((measure) => measure.status === "available");

  const save = async () => {
    try {
      /* Out-of-scope fields are never written from here: they keep whatever
         the record already holds, so saving a cabinet job cannot invent room
         geometry that the ballpark would then reprice. */
      await m.saveMeasurements.mutateAsync({
        projectId,
        roomId: null,
        lengthFt: shows("lengthFt") ? input.lengthFt : record?.lengthFt ?? null,
        widthFt: shows("widthFt") ? input.widthFt : record?.widthFt ?? null,
        ceilingHeightFt: shows("ceilingHeightFt")
          ? input.ceilingHeightFt
          : record?.ceilingHeightFt ?? null,
        openings: shows("doors") || shows("windows") ? input.openings : record?.openings ?? [],
        interiorPartitionLf: shows("interiorPartitionLf")
          ? input.interiorPartitionLf
          : record?.interiorPartitionLf ?? null,
        floorWastePct: shows("floorWastePct") ? input.floorWastePct ?? 10 : record?.floorWastePct ?? 10,
      });
      toast.success(t("geometry.toast.saved"));
      onOpenChange(false);
    } catch {
      toast.error(t("errors.generic"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ruler className="size-5" aria-hidden />
            {t("geometry.dialog.title")}
          </DialogTitle>
          <DialogDescription>{t("geometry.dialog.subtitle")}</DialogDescription>
        </DialogHeader>

        {scope.knownQuantities.length > 0 ? (
          <div
            data-testid="measurements-known-quantities"
            className="rounded-md border border-border bg-surface-muted p-3"
          >
            <p className="text-sm font-medium text-foreground">
              {t("geometry.known.title")}
            </p>
            <ul className="mt-1 space-y-1 text-sm text-foreground-muted">
              {scope.knownQuantities.map((item) => (
                <li key={item.id} className="flex flex-wrap justify-between gap-2">
                  <span>{item.title}</span>
                  <span className="font-medium text-foreground">
                    {item.quantity}
                    {item.unitKey ? ` ${t(`geometry.unit.${item.unitKey}`)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-foreground-muted">{t("geometry.known.hint")}</p>
          </div>
        ) : null}

        {!showsAnyField ? (
          <p data-testid="measurements-no-fields" className="text-sm text-foreground-muted">
            {t("geometry.noFieldsNeeded")}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          {shows("lengthFt") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-length">{t("geometry.fields.length")}</Label>
            <MeasurementInput
              id="geo-length"
              valueFt={lengthOrNull(length)}
              onChangeFt={(feet) => setLength(feet === null ? "" : formatFeet(feet))}
            />
          </div>
          ) : null}
          {shows("widthFt") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-width">{t("geometry.fields.width")}</Label>
            <MeasurementInput
              id="geo-width"
              valueFt={lengthOrNull(width)}
              onChangeFt={(feet) => setWidth(feet === null ? "" : formatFeet(feet))}
            />
          </div>
          ) : null}
          {shows("ceilingHeightFt") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-height">{t("geometry.fields.height")}</Label>
            <MeasurementInput
              id="geo-height"
              valueFt={lengthOrNull(height)}
              onChangeFt={(feet) => setHeight(feet === null ? "" : formatFeet(feet))}
            />
            <p className="text-xs text-muted-foreground">{t("geometry.fields.heightHint")}</p>
          </div>
          ) : null}
          {shows("interiorPartitionLf") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-partitions">{t("geometry.fields.partitions")}</Label>
            <MeasurementInput
              id="geo-partitions"
              valueFt={lengthOrNull(partitions)}
              onChangeFt={(feet) => setPartitions(feet === null ? "" : formatFeet(feet))}
            />
            <p className="text-xs text-muted-foreground">{t("geometry.fields.partitionsHint")}</p>
          </div>
          ) : null}

          {shows("doors") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-doors">{t("geometry.fields.doors")}</Label>
            <Input id="geo-doors" inputMode="numeric" className="h-11"
              value={doors} onChange={(e) => setDoors(e.target.value)} />
          </div>
          ) : null}
          {shows("windows") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-windows">{t("geometry.fields.windows")}</Label>
            <Input id="geo-windows" inputMode="numeric" className="h-11"
              value={windows} onChange={(e) => setWindows(e.target.value)} />
          </div>
          ) : null}
          {shows("floorWastePct") ? (
          <div className="space-y-1">
            <Label htmlFor="geo-waste">{t("geometry.fields.waste")}</Label>
            <Input id="geo-waste" inputMode="decimal" className="h-11"
              value={waste} onChange={(e) => setWaste(e.target.value)} />
          </div>
          ) : null}
        </div>

        {preview.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="mb-2 text-sm font-medium">{t("geometry.preview.title")}</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {preview.map((measure) => (
                <li key={measure.key} className="flex flex-wrap justify-between gap-2">
                  <span>{t(`geometry.measurement.${measure.key}`)}</span>
                  <span className="font-medium text-foreground">
                    {measure.value} {t(`geometry.unit.${measure.unitKey}`)}
                    <span className="ml-2 font-normal text-muted-foreground">{measure.formula}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            {t("geometry.actions.cancel")}
          </Button>
          <Button className="h-11" onClick={save} disabled={m.saveMeasurements.isPending}>
            {t("geometry.actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
