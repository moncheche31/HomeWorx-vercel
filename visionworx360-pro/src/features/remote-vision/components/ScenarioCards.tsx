import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/i18n/format";
import { ContractorBreakdownPanel } from "@/components/estimating/ContractorBreakdownPanel";
import type { EstimateLevel, EstimateScenario } from "@/domains/remoteVision";

interface Props {
  scenarios: EstimateScenario[];
  selected: EstimateLevel;
  onSelect: (level: EstimateLevel) => void;
}

export function ScenarioCards({ scenarios, selected, onSelect }: Props) {
  const { t, i18n } = useTranslation("remote-vision");
  const money = (value: number) => formatCurrency(value, i18n.language, "USD");

  if (scenarios.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("levels.empty")}</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{t("levels.title")}</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {scenarios.map((s) => {
          const isSelected = s.level === selected;
          return (
            <Card
              key={s.level}
              className={isSelected ? "border-primary ring-1 ring-primary" : undefined}
            >
              <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">{t(`levels.${s.level}`)}</CardTitle>
                <Badge variant="secondary">
                  {t("levels.confidence")} {Math.round(s.confidence * 100)}%
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-foreground-muted">
                    {t("levels.range")}
                  </p>
                  {/* Never present a fake $0 – $0 band for recognized scope. */}
                  {s.pricingBlocked ? (
                    <p className="text-sm font-semibold text-destructive">
                      {t("levels.pricingBlocked")}
                    </p>
                  ) : (
                    <p className="text-xl font-semibold">
                      {money(s.costLow)} – {money(s.costHigh)}
                    </p>
                  )}
                </div>
                {s.unpricedFeatures && s.unpricedFeatures.length > 0 ? (
                  <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2">
                    <p className="text-xs font-semibold">
                      {t("levels.unpricedTitle", { count: s.unpricedFeatures.length })}
                    </p>
                    {/* The contractor must be able to see WHY a line has no price. */}
                    <ul className="space-y-0.5 text-xs text-foreground-muted">
                      {s.unpricedFeatures.map((f) => (
                        <li key={f.featureKey}>
                          <span className="font-medium text-foreground">{f.label}</span>
                          {" — "}
                          {t(`levels.unpricedReason.${f.reason}`, {
                            defaultValue: t("levels.unpricedReason.unknown"),
                          })}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-foreground-muted">{t("levels.unpricedHint")}</p>
                  </div>
                ) : null}
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-foreground-muted">{t("levels.labor")}</dt>
                    <dd>{t("levels.laborValue", { hours: Math.round(s.laborHours) })}</dd>
                  </div>
                  <div>
                    <dt className="text-foreground-muted">{t("levels.duration")}</dt>
                    <dd>{t("levels.durationValue", { days: s.durationDays })}</dd>
                  </div>
                </dl>
                {s.drivers.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-foreground-muted">
                      {t("levels.drivers")}
                    </p>
                    <ul className="space-y-1 text-sm">
                      {s.drivers.slice(0, 4).map((d) => (
                        <li key={d.featureKey} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {d.label}
                            {/* Allowance-priced work is money, but never presented as confirmed. */}
                            {d.quantityBasis === "ballpark_allowance" ? (
                              <Badge variant="outline" className="ml-2 align-middle text-[10px]">
                                {t("levels.allowanceBadge")}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-foreground-muted">
                            {money(d.costLow)}–{money(d.costHigh)}
                          </span>
                        </li>
                      ))}

                    </ul>
                  </div>
                ) : null}
                {/* Internal-only; never part of client/realtor output. */}
                <ContractorBreakdownPanel breakdown={s.breakdown} currency="USD" />
                <Button
                  variant={isSelected ? "default" : "outline"}
                  className="min-h-12 w-full"
                  onClick={() => onSelect(s.level)}
                >
                  {isSelected ? <Check className="mr-2 size-4" aria-hidden /> : null}
                  {isSelected ? t("levels.selected") : t("levels.select")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-foreground-muted">{t("levels.basedOn")}</p>
    </div>
  );
}
