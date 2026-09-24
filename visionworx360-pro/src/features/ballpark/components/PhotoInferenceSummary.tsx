import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ChevronLeft, Pencil, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  scaleReferenceFor,
  summaryMeasurements,
  type MeasurementEstimate,
  type MeasurementSourceType,
  type PhotoInferenceResult,
} from "@/domains/ballpark";

interface Props {
  inference: PhotoInferenceResult;
  onConfirm: (key: string) => void;
  onAdjust: (key: string, value: number) => void;
  onBack?: () => void;
  onContinue?: () => void;
}

const UNIT_SUFFIX: Record<string, string> = { ft: "ft", sf: "SF", lf: "LF", each: "" };

/** Known, inferred and assumed are shown apart — never blended into one list. */
const GROUPS: { key: string; titleKey: string; types: MeasurementSourceType[] }[] = [
  { key: "known", titleKey: "inference.group.known", types: ["confirmed", "user_entered"] },
  { key: "inferred", titleKey: "inference.group.inferred", types: ["inferred"] },
  { key: "assumed", titleKey: "inference.group.assumed", types: ["assumed"] },
];

function displayValue(estimate: MeasurementEstimate): string {
  const suffix = UNIT_SUFFIX[estimate.unit] ?? "";
  if (estimate.low === estimate.high) return `${estimate.value} ${suffix}`.trim();
  return `${estimate.low}–${estimate.high} ${suffix}`.trim();
}

/**
 * What the photos suggested, and how sure we are.
 *
 * Every row states where its number came from, anything the engine refused is
 * said out loud rather than hidden, and any value can be accepted or corrected
 * in place — correcting one number never restarts the estimate.
 */
export function PhotoInferenceSummary({
  inference,
  onConfirm,
  onAdjust,
  onBack,
  onContinue,
}: Props) {
  const { t } = useTranslation("ballpark");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const rows = summaryMeasurements(inference);
  const references = inference.referenceKeys
    .map((key) => scaleReferenceFor(key))
    .filter((ref): ref is NonNullable<typeof ref> => Boolean(ref));

  const commit = (key: string) => {
    const value = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(value) && value > 0) onAdjust(key, value);
    setEditing(null);
    setDraft("");
  };

  const renderRow = (row: MeasurementEstimate) => (
    <li
      key={row.key}
      className={`rounded-lg border p-3 ${
        row.sourceType === "inferred"
          ? "border-dashed border-primary/40 bg-primary/5"
          : "border-border"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t(row.labelKey)}</p>
          <p className="text-sm text-foreground-muted">{displayValue(row)}</p>
          {row.basis ? (
            <p className="text-xs text-foreground-muted">
              {row.basis.startsWith("inference.") ? t(row.basis) : row.basis}
            </p>
          ) : null}
        </div>
        <Badge variant={row.confirmed ? "default" : "outline"}>
          {t(`inference.source.${row.sourceType}`)}
        </Badge>
      </div>

      {editing === row.key ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            autoFocus
            inputMode="decimal"
            className="min-h-(--control-min-h)"
            value={draft}
            aria-label={t(row.labelKey)}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit(row.key);
            }}
          />
          <Button className="min-h-(--control-min-h)" onClick={() => commit(row.key)}>
            {t("inference.save")}
          </Button>
        </div>
      ) : row.derived ? null : (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="min-h-(--control-min-h) text-sm"
            disabled={row.confirmed}
            onClick={() => onConfirm(row.key)}
          >
            <Check className="mr-1 size-4" aria-hidden />
            {t("inference.confirm")}
          </Button>
          <Button
            variant="outline"
            className="min-h-(--control-min-h) text-sm"
            onClick={() => {
              setEditing(row.key);
              setDraft(String(row.value));
            }}
          >
            <Pencil className="mr-1 size-4" aria-hidden />
            {t("inference.adjust")}
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="size-4 text-primary" aria-hidden />
          {t("inference.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-foreground-muted">{t("inference.roomType")}</p>
            <p className="font-medium text-foreground">
              {inference.roomType
                ? t(`options.roomType.${inference.roomType}`, { defaultValue: inference.roomType })
                : t("inference.unknownRoomType")}
            </p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-xs text-foreground-muted">{t("inference.confidence")}</p>
            <p className="font-medium text-foreground">
              {t(`confidence.${inference.confidenceBand}`)}
            </p>
          </div>
        </div>

        {/* Anything contradictory or implausible is stated, never smoothed over. */}
        {inference.warnings.length > 0 ? (
          <ul className="space-y-2">
            {inference.warnings.map((warning) => (
              <li
                key={warning.code}
                className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                  warning.severity === "error"
                    ? "border-destructive/40 bg-destructive/10 text-foreground"
                    : "border-warning/40 bg-warning/10 text-foreground"
                }`}
              >
                <AlertTriangle
                  className={`mt-0.5 size-4 shrink-0 ${
                    warning.severity === "error" ? "text-destructive" : "text-warning"
                  }`}
                  aria-hidden
                />
                {t(warning.messageKey)}
              </li>
            ))}
          </ul>
        ) : null}

        {inference.rejected.length > 0 ? (
          <div className="space-y-1 rounded-lg border border-border p-3">
            <p className="text-xs font-medium text-foreground">{t("inference.rejectedTitle")}</p>
            {inference.rejected.map((rejected, index) => (
              <p key={`${rejected.target}-${index}`} className="text-xs text-foreground-muted">
                {t(`inference.target.${rejected.target}`)} — {t(rejected.messageKey)}
              </p>
            ))}
          </div>
        ) : null}

        {references.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-foreground-muted">{t("inference.detectedReferences")}</p>
            <div className="flex flex-wrap gap-1.5">
              {references.map((ref) => (
                <Badge key={ref.key} variant="secondary">
                  {t(ref.labelKey)}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => group.types.includes(row.sourceType));
          if (groupRows.length === 0) return null;
          return (
            <section key={group.key} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                {t(group.titleKey)}
              </h3>
              <ul className="space-y-2">{groupRows.map(renderRow)}</ul>
            </section>
          );
        })}

        <p className="rounded-lg border border-border p-3 text-xs text-foreground-muted">
          {t("inference.disclaimer")}
        </p>

        {onContinue || onBack ? (
          <div className={`grid gap-2 ${onBack && onContinue ? "grid-cols-2" : "grid-cols-1"}`}>
            {onBack ? (
              <Button
                variant="outline"
                className="min-h-(--control-min-h) text-base"
                onClick={onBack}
              >
                <ChevronLeft className="mr-1 size-5" aria-hidden />
                {t("actions.back")}
              </Button>
            ) : null}
            {onContinue ? (
              <Button className="min-h-(--control-min-h) text-base" onClick={onContinue}>
                {t("inference.continue")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
