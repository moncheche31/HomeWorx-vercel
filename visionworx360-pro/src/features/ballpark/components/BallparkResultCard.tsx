import { useTranslation } from "react-i18next";
import { ArrowRight, Check, History, Info, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WarningNotice } from "@/components/feedback/Notice";
import { formatCurrency } from "@/i18n/format";
import type {
  BallparkBandLike,
  BallparkHistory,
  MultiInputBallparkResult,
} from "@/domains/ballpark";
import { BallparkDisclaimer } from "./BallparkDisclaimer";
import { InputLedgerCard } from "./InputLedgerCard";

interface Props {
  result: MultiInputBallparkResult;
  /**
   * The band to display. The page resolves this from the CURRENT saved
   * snapshot; the freshly computed band only wins once a fact actually
   * changed. Omitted in contexts with no saved snapshot.
   */
  band?: BallparkBandLike;
  /** The current saved band, shown for reference while previewing. */
  savedBand?: BallparkBandLike | null;
  /** True when `band` is an uncommitted refinement of `savedBand`. */
  isPreview?: boolean;
  history?: BallparkHistory | null;
  saving?: boolean;
  onUse: () => void;
  onRefine: (questionId?: string) => void;
  onContinueDetailed: () => void;
}

/**
 * The honesty screen: a range instead of a false exact price, every input
 * filed by where it came from, every unknown named, and the preliminary
 * disclaimer attached to the result itself.
 */
export function BallparkResultCard({
  result,
  band: bandProp,
  savedBand,
  isPreview,
  history,
  saving,
  onUse,
  onRefine,
  onContinueDetailed,
}: Props) {
  const { t, i18n } = useTranslation("ballpark");
  const money = (value: number) => formatCurrency(value, i18n.language, result.currency);
  const band = bandProp ?? result.band;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-lg">
              {isPreview ? t("result.previewTitle") : t("result.title")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`intake.${result.source}.title`)}</Badge>
              <Badge variant={result.confidence === "high" ? "default" : "secondary"}>
                {t("result.confidence")}: {t(`result.confidenceLevel.${result.confidence}`)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {(["low", "expected", "high"] as const).map((key) => (
              <div
                key={key}
                className={
                  key === "expected"
                    ? "rounded-lg border border-primary/40 bg-primary/5 p-3"
                    : "rounded-lg border border-border p-3"
                }
              >
                <p className="text-xs uppercase tracking-wide text-foreground-muted">
                  {t(`result.${key}`)}
                </p>
                <p className="text-xl font-semibold text-foreground sm:text-2xl">
                  {money(band[key])}
                </p>
              </div>
            ))}
          </div>
          {isPreview && savedBand ? (
            <p className="text-sm text-foreground-muted">
              {t("result.previewNote", {
                low: money(savedBand.low),
                high: money(savedBand.high),
              })}
            </p>
          ) : null}
          <p className="text-sm text-foreground-muted">{t("result.preliminary")}</p>
          <p className="text-xs text-foreground-muted">
            {t("result.widenSummary", {
              total: result.totalWidenPct,
              source: result.sourceWidenPct,
            })}
          </p>
          {result.warnings.map((warning) => (
            <WarningNotice key={warning.code} title={t(warning.messageKey)} />
          ))}
        </CardContent>
      </Card>

      <BallparkDisclaimer disclaimers={result.disclaimers} />

      <InputLedgerCard ledger={result.ledger} onEdit={onRefine} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("result.quantities")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {result.quantities.map((quantity) => (
            <div
              key={quantity.itemKey}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{t(quantity.labelKey)}</p>
                <p className="text-xs text-foreground-muted">{quantity.formula}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">
                  {quantity.quantity.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}
                </p>
                {quantity.isAssumed ? (
                  <Badge variant="secondary" className="mt-1">
                    {t("result.source.assumed")}
                  </Badge>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {history && history.events.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" aria-hidden />
              {t("history.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.events
              .slice()
              .reverse()
              .map((event) => (
                <div key={event.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">{t(`history.kind.${event.kind}`)}</p>
                  <p className="text-foreground-muted">
                    {new Date(event.at).toLocaleString(i18n.language)} ·{" "}
                    {t("history.changed", { count: event.changedKeys.length })}
                  </p>
                  {event.bandBefore && event.bandAfter ? (
                    <p className="text-foreground-muted">
                      {money(event.bandBefore.low)}–{money(event.bandBefore.high)} →{" "}
                      {money(event.bandAfter.low)}–{money(event.bandAfter.high)}
                    </p>
                  ) : null}
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button className="min-h-(--control-min-h) text-base" disabled={saving} onClick={onUse}>
          <Check className="mr-2 size-5" aria-hidden />
          {t("after.use")}
        </Button>
        <Button
          variant="outline"
          className="min-h-(--control-min-h) text-base"
          onClick={() => onRefine()}
        >
          <Ruler className="mr-2 size-5" aria-hidden />
          {t("after.refine")}
        </Button>
        <Button
          variant="outline"
          className="min-h-(--control-min-h) text-base"
          onClick={onContinueDetailed}
        >
          <ArrowRight className="mr-2 size-5" aria-hidden />
          {t("after.continue")}
        </Button>
        <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-foreground-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <span className="block font-medium text-foreground">{t("after.later")}</span>
            {t("after.laterHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
