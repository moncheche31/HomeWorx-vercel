import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronLeft, Info, Pencil, ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PhotoAnalysis, PhotoAnalysisFact } from "@/domains/ballpark";

interface Props {
  analysis: PhotoAnalysis;
  /** Jump straight to the interview question behind a fact. */
  onCorrect?: (key: string) => void;
  onBack?: () => void;
  onContinue?: () => void;
}

const UNIT_SUFFIX: Record<string, string> = {
  ft: "ft",
  sf: "SF",
  class: "",
  category: "",
  none: "",
};

/**
 * The Photo Analysis Summary.
 *
 * The automatic first screen of the photo path: what these images are, what we
 * think the job is, how sure we are of each piece, and which images each claim
 * came from. Nothing here pretends to be measured — every row states its own
 * provenance, and any row can be corrected in one tap.
 */
export function PhotoAnalysisSummary({ analysis, onCorrect, onBack, onContinue }: Props) {
  const { t } = useTranslation("ballpark");

  const label = (fact: PhotoAnalysisFact) => {
    const suffix = UNIT_SUFFIX[fact.unit] ?? "";
    if (typeof fact.value === "number") {
      const band =
        fact.low != null && fact.high != null && fact.low !== fact.high
          ? `${fact.low}–${fact.high}`
          : String(fact.value);
      return `${band} ${suffix}`.trim();
    }
    if (typeof fact.value === "string") {
      return t(fact.value, { defaultValue: fact.value.split(".").pop() ?? fact.value });
    }
    return t("analysis.unknownValue");
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="size-4 text-primary" aria-hidden />
          {t("analysis.summaryTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {t("analysis.photoCount", { count: analysis.photoCount })}
          </Badge>
          <Badge variant="outline">{t(`photos.kind.${analysis.dominantKind}`)}</Badge>
          <Badge variant="outline">
            {t(`confidence.${analysis.confidenceBand}`, {
              defaultValue: analysis.confidenceBand,
            })}
          </Badge>
          <Badge variant="outline">{t(`analysis.condition.${analysis.conditionStatus}`)}</Badge>
        </div>

        {analysis.facts.length > 0 ? (
          <ul className="space-y-2">
            {analysis.facts.map((fact) => (
              <li
                key={fact.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t(fact.labelKey, { defaultValue: fact.key })}
                  </p>
                  <p className="text-sm text-foreground-muted">{label(fact)}</p>
                  <p className="text-xs text-foreground-muted">
                    {t(`analysis.source.${fact.sourceType}`)} ·{" "}
                    {t(fact.basisKey, { defaultValue: "" })}
                    {fact.imageIds.length
                      ? ` · ${t("analysis.fromImages", { count: fact.imageIds.length })}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={fact.confidenceBand === "high" ? "secondary" : "outline"}>
                    {t("analysis.confidenceValue", {
                      value: Math.round(fact.confidence * 100),
                    })}
                  </Badge>
                  {onCorrect ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-(--control-min-h-sm)"
                      onClick={() => onCorrect(fact.key)}
                    >
                      <Pencil className="mr-1 size-3.5" aria-hidden />
                      {t("analysis.correct")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-muted">{t("analysis.nothingYet")}</p>
        )}

        {/* Confirmed vs uncertain, known vs unknown — kept strictly apart. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium text-foreground">{t("analysis.confirmedTitle")}</h3>
            {analysis.confirmedObservations.length > 0 ? (
              <ul className="space-y-1">
                {analysis.confirmedObservations.map((key) => (
                  <li key={key} className="text-sm text-foreground-muted">
                    {t(`obs.${key}`, { defaultValue: key })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-foreground-muted">{t("analysis.confirmedEmpty")}</p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium text-foreground">{t("analysis.uncertainTitle")}</h3>
            {analysis.uncertainObservations.length > 0 ? (
              <ul className="space-y-1">
                {analysis.uncertainObservations.map((key) => (
                  <li key={key} className="text-sm text-foreground-muted">
                    {t(`obs.${key}`, { defaultValue: key })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-foreground-muted">{t("analysis.uncertainEmpty")}</p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium text-foreground">{t("analysis.knownTitle")}</h3>
            {analysis.knownMeasurements.length > 0 ? (
              <ul className="space-y-1">
                {analysis.knownMeasurements.map((m) => (
                  <li key={m.key} className="text-sm text-foreground-muted">
                    {t(m.labelKey, { defaultValue: m.key })}: {m.value}{" "}
                    <span className="text-xs">({t(`analysis.source.${m.sourceType}`)})</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-foreground-muted">{t("analysis.knownEmpty")}</p>
            )}
          </section>

          <section className="space-y-2 rounded-lg border border-border p-3">
            <h3 className="text-sm font-medium text-foreground">{t("analysis.unknownTitle")}</h3>
            {analysis.unknownMeasurements.length > 0 ? (
              <ul className="space-y-1">
                {analysis.unknownMeasurements.map((key) => (
                  <li key={key} className="text-sm text-foreground-muted">
                    {t(`analysis.measure.${key}`, { defaultValue: key })}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-foreground-muted">{t("analysis.unknownEmpty")}</p>
            )}
          </section>
        </div>

        {analysis.scopeCategories.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">{t("analysis.scopeTitle")}</h3>
            <ul className="flex flex-wrap gap-2">
              {analysis.scopeCategories.map((category) => (
                <li key={category}>
                  <Badge variant="outline">
                    {t(`analysis.scope.${category}`, { defaultValue: category })}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="space-y-2 rounded-lg border border-border p-3">
          {analysis.notes.map((note) => (
            <p key={note.code} className="flex items-start gap-2 text-xs text-foreground-muted">
              {note.severity === "warning" ? (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
              ) : (
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              )}
              {t(note.messageKey)}
            </p>
          ))}
        </div>

        {analysis.clarificationIds.length > 0 ? (
          <p className="text-sm text-foreground-muted">
            {t("analysis.questionsAhead", { count: analysis.clarificationIds.length })}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
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
              {t("analysis.continue")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
