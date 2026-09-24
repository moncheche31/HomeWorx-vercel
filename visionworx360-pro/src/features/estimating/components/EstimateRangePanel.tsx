import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/i18n/format";
import {
  buildEstimateRange,
  buildRangeNarrative,
  DEFAULT_RANGE_ASSUMPTIONS,
  normalizeAssumptions,
  RANGE_TIERS,
  recommendationsToAdjustments,
  type EngineLineInput,
  type RangeAssumptions,
  type RangeTier,
} from "@/domains/estimating";
import { useCopilot } from "@/features/copilot/hooks/useCopilot";
import type { EstimateDTO } from "../types";

interface Props {
  projectId: string;
  estimate: EstimateDTO;
  lines: EngineLineInput[];
  readOnly?: boolean;
  saving?: boolean;
  onSave: (assumptions: RangeAssumptions, snapshot: Record<string, unknown>) => void;
}

const ALLOWANCE_KEYS = ["permit", "disposal", "equipment", "subcontractor", "other"] as const;

/**
 * Narrative-first review of the V1 preliminary range. The dense editable grid
 * stays behind "Pricing details" — the contractor only sees prose by default.
 */
export function EstimateRangePanel({
  projectId,
  estimate,
  lines,
  readOnly,
  saving,
  onSave,
}: Props) {
  const { t, i18n } = useTranslation("estimating");
  const locale = i18n.language?.startsWith("es") ? "es-US" : "en-US";
  const money = (v: number) => formatCurrency(v, i18n.language, estimate.currency);

  const [assumptions, setAssumptions] = useState<RangeAssumptions>(() =>
    normalizeAssumptions(estimate.rangeAssumptions),
  );
  const [detailsOpen, setDetailsOpen] = useState(false);

  const copilot = useCopilot(projectId, estimate.title);

  const baseConfig = useMemo(
    () => ({
      currency: estimate.currency,
      taxRatePct: estimate.taxRate,
      defaultOverheadPct: estimate.defaultOverheadPct,
      defaultProfitPct: estimate.defaultProfitPct,
      defaultContingencyPct: estimate.defaultContingencyPct,
      /* Ballpark ranges price with the SAME method as the detailed estimate. */
      pricingStrategy: pricingStrategyOf(estimate),
    }),
    [estimate],
  );

  // Two passes: the first sizes percentage-based review savings off the mid.
  const baseRange = useMemo(
    () =>
      buildEstimateRange(
        lines,
        baseConfig,
        { ...assumptions, adjustments: [] },
        { ungroupedLabel: t("group.ungrouped") },
      ),
    [lines, baseConfig, assumptions, t],
  );

  const adjustments = useMemo(
    () => recommendationsToAdjustments(copilot.accepted, baseRange.selected.mid),
    [copilot.accepted, baseRange.selected.mid],
  );

  const range = useMemo(
    () =>
      buildEstimateRange(
        lines,
        baseConfig,
        { ...assumptions, adjustments },
        { ungroupedLabel: t("group.ungrouped") },
      ),
    [lines, baseConfig, assumptions, adjustments, t],
  );

  const narrative = buildRangeNarrative(range, { locale });

  const setField = <K extends keyof RangeAssumptions>(key: K, value: RangeAssumptions[K]) =>
    setAssumptions((a) => ({ ...a, [key]: value }));

  const numberField = (
    key: "laborRate" | "overheadPct" | "profitPct" | "contingencyPct",
    label: string,
  ) => (
    <div className="space-y-1" key={key}>
      <Label htmlFor={`range-${key}`} className="text-xs">{label}</Label>
      <Input
        id={`range-${key}`}
        className="h-11"
        inputMode="decimal"
        disabled={readOnly}
        placeholder={t("range.fields.useLineValues")}
        value={assumptions[key] ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          setField(key, raw === "" ? null : Number(raw));
        }}
      />
    </div>
  );

  const save = () =>
    onSave({ ...assumptions, adjustments }, {
      currency: range.currency,
      calculatedAt: new Date().toISOString(),
      tiers: range.tiers.map((tier) => ({
        tier: tier.tier,
        low: tier.low,
        mid: tier.mid,
        high: tier.high,
      })),
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{t("range.title")}</CardTitle>
          <Badge variant="secondary">{t("status.draft")}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg font-semibold leading-snug">{narrative}</p>
        <p className="text-xs text-foreground-muted">{t("range.preliminary")}</p>

        {range.isEmpty ? (
          <p className="text-sm text-foreground-muted">{t("range.empty")}</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-foreground-muted">
                {t("range.tier.label")}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {RANGE_TIERS.map((tier) => {
                  const tierResult = range.tiers.find((x) => x.tier === tier)!;
                  const isSelected = assumptions.tier === tier;
                  return (
                    <Button
                      key={tier}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      className="h-auto min-h-16 flex-col items-start gap-1 py-3 text-left"
                      disabled={readOnly}
                      aria-pressed={isSelected}
                      onClick={() => setField("tier", tier as RangeTier)}
                    >
                      <span className="text-sm font-semibold">{t(`range.tier.${tier}`)}</span>
                      <span className="text-xs opacity-80">
                        {money(tierResult.low)} – {money(tierResult.high)}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/*
              Priced scope is always shown on its own line. Accepted review
              options adjust the band, but can never make the priced work
              disappear — combined reductions are capped by the engine.
            */}
            {range.selected.adjustmentImpact.addHigh > 0 ||
            range.selected.adjustmentImpact.reduceHigh > 0 ? (
              <div className="space-y-1 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span>{t("range.basePriced")}</span>
                  <span className="tabular-nums text-foreground-muted">
                    {money(range.selected.base.low)} – {money(range.selected.base.high)}
                  </span>
                </div>
                {range.selected.adjustmentImpact.addHigh > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>{t("range.review.adds")}</span>
                    <span className="tabular-nums text-foreground-muted">
                      + {money(range.selected.adjustmentImpact.addLow)} –{" "}
                      {money(range.selected.adjustmentImpact.addHigh)}
                    </span>
                  </div>
                ) : null}
                {range.selected.adjustmentImpact.reduceHigh > 0 ? (
                  <div className="flex justify-between gap-3">
                    <span>{t("range.review.reduces")}</span>
                    <span className="tabular-nums text-foreground-muted">
                      − {money(range.selected.adjustmentImpact.reduceLow)} –{" "}
                      {money(range.selected.adjustmentImpact.reduceHigh)}
                    </span>
                  </div>
                ) : null}
                {range.selected.adjustmentImpact.capped ? (
                  <p className="text-xs text-warning">{t("range.review.capped")}</p>
                ) : null}
              </div>
            ) : null}

            {range.selected.sections.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-foreground-muted">
                  {t("range.sections")}
                </p>
                <ul className="space-y-1 text-sm">
                  {range.selected.sections.map((s) => (
                    <li key={s.key} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">{s.label}</span>
                      <span className="shrink-0 text-foreground-muted">
                        {money(s.low)} – {money(s.high)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}

        <p className="text-xs text-foreground-muted">{t("range.assumptionsNotice")}</p>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 rounded-md border border-border px-3 text-left text-sm font-medium"
            >
              {t("range.details")}
              <ChevronDown
                className={`size-4 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <p className="text-xs text-foreground-muted">{t("range.detailsHint")}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              {numberField("laborRate", t("range.fields.laborRate"))}
              {numberField("overheadPct", t("range.fields.overheadPct"))}
              {numberField("profitPct", t("range.fields.profitPct"))}
              {numberField("contingencyPct", t("range.fields.contingencyPct"))}
              <div className="space-y-1">
                <Label htmlFor="range-regional" className="text-xs">
                  {t("range.fields.regionalFactor")}
                </Label>
                <Input
                  id="range-regional"
                  className="h-11"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={assumptions.regionalFactor}
                  onChange={(e) =>
                    setField("regionalFactor", Number(e.target.value) || 1)
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-6">
                <Label htmlFor="range-markup-allowances" className="text-xs">
                  {t("range.fields.markupOnAllowances")}
                </Label>
                <Switch
                  id="range-markup-allowances"
                  disabled={readOnly}
                  checked={assumptions.markupOnAllowances}
                  onCheckedChange={(v) => setField("markupOnAllowances", v)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("range.allowances.title")}</p>
              {assumptions.allowances.length === 0 ? (
                <p className="text-xs text-foreground-muted">{t("range.allowances.empty")}</p>
              ) : null}
              {assumptions.allowances.map((allowance, index) => (
                <div key={`${allowance.key}-${index}`} className="flex flex-wrap gap-2">
                  <Input
                    className="h-11 min-w-40 flex-1"
                    aria-label={t("range.allowances.label")}
                    disabled={readOnly}
                    value={allowance.label ?? t(`range.allowances.${allowance.key}`, allowance.key)}
                    onChange={(e) =>
                      setAssumptions((a) => ({
                        ...a,
                        allowances: a.allowances.map((x, i) =>
                          i === index ? { ...x, label: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                  <Input
                    className="h-11 w-32"
                    inputMode="decimal"
                    aria-label={t("range.allowances.amount")}
                    disabled={readOnly}
                    value={allowance.amount}
                    onChange={(e) =>
                      setAssumptions((a) => ({
                        ...a,
                        allowances: a.allowances.map((x, i) =>
                          i === index ? { ...x, amount: Number(e.target.value) || 0 } : x,
                        ),
                      }))
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    disabled={readOnly}
                    aria-label={t("range.allowances.remove")}
                    onClick={() =>
                      setAssumptions((a) => ({
                        ...a,
                        allowances: a.allowances.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={readOnly}
                onClick={() =>
                  setAssumptions((a) => {
                    const next =
                      ALLOWANCE_KEYS.find((k) => !a.allowances.some((x) => x.key === k)) ?? "other";
                    return {
                      ...a,
                      allowances: [
                        ...a.allowances,
                        { key: next, label: t(`range.allowances.${next}`), amount: 0 },
                      ],
                    };
                  })
                }
              >
                <Plus className="mr-1 size-4" aria-hidden />
                {t("range.allowances.add")}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("range.review.title")}</p>
              {copilot.review.recommendations.length === 0 ? (
                <p className="text-xs text-foreground-muted">{t("range.review.empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {copilot.review.recommendations
                    .filter(
                      (rec) =>
                        rec.sectionKey === "upsell" || rec.sectionKey === "value_engineering",
                    )
                    .map((rec) => {
                      const decision = copilot.decisionFor(rec.id);
                      const applied = adjustments.find((a) => a.id === rec.id);
                      return (
                        <li key={rec.id} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{rec.customerLabel}</span>
                          {applied ? (
                            <span className="text-xs text-foreground-muted">
                              {applied.kind === "add"
                                ? t("range.review.adds")
                                : t("range.review.reduces")}{" "}
                              {money(applied.low)}–{money(applied.high)}
                            </span>
                          ) : null}
                          <Button
                            type="button"
                            variant={decision === "accepted" ? "default" : "outline"}
                            className="h-9"
                            onClick={() =>
                              copilot.setDecision(
                                rec.id,
                                decision === "accepted" ? "removed" : "accepted",
                              )
                            }
                          >
                            {decision === "accepted"
                              ? t("range.review.remove")
                              : t("range.review.accept")}
                          </Button>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">{t("range.breakdown.title")}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {(
                  [
                    ["totals.labor", range.selected.breakdown.labor],
                    ["totals.material", range.selected.breakdown.material],
                    ["totals.equipment", range.selected.breakdown.equipment],
                    ["totals.subcontractor", range.selected.breakdown.subcontractor],
                    ["totals.allowances", range.selected.breakdown.allowances],
                    ["totals.overhead", range.selected.breakdown.overhead],
                    ["totals.profit", range.selected.breakdown.profit],
                    ["totals.contingency", range.selected.breakdown.contingency],
                    ["totals.tax", range.selected.breakdown.tax],
                  ] as const
                ).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="text-foreground-muted">{t(key)}</dt>
                    <dd>{money(value)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" disabled={readOnly || saving} onClick={save}>
                <Save className="mr-1 size-4" aria-hidden />
                {t("range.actions.save")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={readOnly}
                onClick={() => setAssumptions({ ...DEFAULT_RANGE_ASSUMPTIONS })}
              >
                <RotateCcw className="mr-1 size-4" aria-hidden />
                {t("range.actions.reset")}
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
