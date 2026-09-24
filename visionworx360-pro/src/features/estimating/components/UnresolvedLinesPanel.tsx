import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ResolutionSummary } from "@/domains/estimating/resolution";
import { LineMeasurementCapture } from "./LineMeasurementCapture";

interface Props {
  summary: ResolutionSummary;
  projectId?: string;
  estimateId?: string;
  locale?: "en-US" | "es-US";
  readOnly?: boolean;
  /**
   * Ballpark mode. Suppresses the unresolved-line callout and its measurement
   * CTA: resolving quantities is a Detailed-estimate workflow. The neutral
   * "assumptions used" disclosure still renders.
   */
  hideUnresolved?: boolean;
}

/**
 * The honesty surface for the Universal Estimating Engine — now with three
 * distinct kinds of line, never blurred together:
 *
 *  - blocked: the engine cannot defend a number, so the line is not priced;
 *  - assumed default: the line prices off a fabricated "1", which is a
 *    workable ballpark but is NOT evidence and must be confirmed on site;
 *  - measured: a real quantity, shown nowhere here because nothing is missing.
 *
 * Blocked lines carry an on-site capture control: say the measurement and the
 * line resolves, without leaving the estimate.
 */
export function UnresolvedLinesPanel({
  summary,
  projectId,
  estimateId,
  locale = "en-US",
  readOnly,
  hideUnresolved,
}: Props) {
  const { t } = useTranslation("estimating");
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const canCapture = !readOnly && !!projectId && !!estimateId;
  const showUnresolved = !hideUnresolved && summary.unresolved > 0;

  if (!showUnresolved && summary.assumedDefault === 0) return null;

  return (
    <div className="space-y-3">
      {showUnresolved ? (
        <section
          role="status"
          aria-label={t("resolution.title")}
          data-testid="estimate-unresolved-lines"
          className="space-y-3 rounded-md border border-warning/50 bg-warning/10 px-3 py-3 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-foreground">
            <HelpCircle className="size-4 shrink-0" aria-hidden />
            {t("resolution.title")}
          </p>
          <p className="text-foreground-muted">
            {t("resolution.summary", { unresolved: summary.unresolved, total: summary.total })}
          </p>
          <ul className="space-y-3">
            {summary.lines.map((line) => (
              <li key={line.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-medium text-foreground">{line.description}</span>
                  <span className="text-foreground-muted">
                    {t(`resolution.reason.${line.reason}`, {
                      defaultValue: t("resolution.reason.no_catalog_match"),
                    })}
                  </span>
                  {(line.laborHoursPerUnit ?? 0) > 0 && line.unitKey ? (
                    <span className="text-xs text-foreground-muted">
                      {t("resolution.rateKnown", {
                        hours: line.laborHoursPerUnit,
                        unit: t(`units.${line.unitKey}`, { defaultValue: line.unitKey }),
                      })}
                    </span>
                  ) : null}
                </div>
                {canCapture ? (
                  openLineId === line.id ? (
                    <LineMeasurementCapture
                      projectId={projectId!}
                      estimateId={estimateId!}
                      lineId={line.id}
                      description={line.description}
                      unitKey={line.unitKey}
                      locale={locale}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="touch-target"
                      onClick={() => setOpenLineId(line.id)}
                    >
                      <Ruler className="mr-2 size-4" aria-hidden />
                      {t("measure.open")}
                    </Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-foreground-muted">{t("resolution.notFinal")}</p>
        </section>
      ) : null}

      {summary.assumedDefault > 0 ? (
        <section
          role="status"
          aria-label={t("assumedQuantity.title")}
          data-testid="estimate-assumed-quantity-lines"
          className="space-y-2 rounded-md border border-border bg-surface-muted px-3 py-3 text-sm"
        >
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Ruler className="size-4 shrink-0" aria-hidden />
            {t("assumedQuantity.title")}
          </p>
          <p className="text-foreground-muted">
            {t("assumedQuantity.summary", {
              assumed: summary.assumedDefault,
              measured: summary.measured,
              total: summary.total,
            })}
          </p>
          <ul className="space-y-1.5">
            {summary.assumedLines.map((line) => (
              <li key={line.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-foreground">{line.description}</span>
                <span className="text-foreground-muted">
                  {t("assumedQuantity.line", {
                    quantity: line.quantity,
                    unit: t(`units.${line.unitKey}`, { defaultValue: line.unitKey ?? "" }),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
