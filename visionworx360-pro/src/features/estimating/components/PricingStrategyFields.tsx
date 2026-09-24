import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import {
  GROSS_MARGIN_PRESETS,
  isValidTargetGrossMargin,
  type PricingStrategy,
} from "@/domains/estimating/pricingStrategy";

const SOURCE_KEY: Record<string, string> = {
  gp30: "sourceNahb",
  gp33: "sourceQr33",
  gp40: "sourceQr40",
};

/**
 * CONTRACTOR-ONLY editor for the pricing METHOD.
 *
 * The two methods are mutually exclusive: a single radio decides which one is
 * in force, and only that method's inputs are editable. Benchmarks are
 * labelled as benchmarks/published guidance with their attribution — never as
 * industry standards, requirements or endorsements.
 */
export function PricingStrategyFields({
  value,
  onChange,
  idPrefix = "pricing-strategy",
}: {
  value: PricingStrategy;
  onChange: (next: PricingStrategy) => void;
  idPrefix?: string;
}) {
  const { t } = useTranslation("estimating");
  const targetValid = isValidTargetGrossMargin(value.targetGrossMarginPct);
  const isTarget = value.method === "target_gross_margin";

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return (
    <div className="grid gap-4" data-testid="pricing-strategy-fields">
      <p className="text-xs text-foreground-muted">{t("pricingStrategy.description")}</p>

      <RadioGroup
        value={value.method}
        onValueChange={(m) =>
          onChange({ ...value, method: m as PricingStrategy["method"] })
        }
        className="grid gap-3"
      >
        {/* A — target gross profit margin */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-3">
            <RadioGroupItem
              value="target_gross_margin"
              id={`${idPrefix}-target`}
              className="mt-1"
            />
            <div className="grid gap-1">
              <Label htmlFor={`${idPrefix}-target`} className="text-sm font-medium">
                {t("pricingStrategy.targetGrossMargin")}
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground-muted">
                  {t("pricingStrategy.recommended")}
                </span>
              </Label>
              <p className="text-xs text-foreground-muted">
                {t("pricingStrategy.targetGrossMarginHelp")}
              </p>
            </div>
          </div>

          {isTarget ? (
            <div className="mt-3 grid gap-3 pl-7">
              <div className="grid gap-1">
                <Label htmlFor={`${idPrefix}-target-pct`} className="text-xs">
                  {t("pricingStrategy.targetPct")}
                </Label>
                <Input
                  id={`${idPrefix}-target-pct`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  max="99.99"
                  step="0.5"
                  className="h-11 max-w-40 tabular-nums"
                  value={String(value.targetGrossMarginPct)}
                  onChange={(e) =>
                    onChange({ ...value, targetGrossMarginPct: num(e.target.value) })
                  }
                />
                {!targetValid ? (
                  <p role="alert" className="text-xs text-destructive">
                    {t("pricingStrategy.invalidTarget")}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <p className="text-xs font-medium">{t("pricingStrategy.presets")}</p>
                <div className="flex flex-wrap gap-2">
                  {GROSS_MARGIN_PRESETS.filter((p) => p.pct != null).map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      size="sm"
                      variant={
                        value.targetGrossMarginPct === preset.pct ? "default" : "outline"
                      }
                      onClick={() =>
                        onChange({ ...value, targetGrossMarginPct: preset.pct as number })
                      }
                    >
                      {t(`pricingStrategy.preset.${preset.key}`)}
                    </Button>
                  ))}
                </div>
                <ul className="grid gap-1">
                  {GROSS_MARGIN_PRESETS.filter((p) => p.sourceUrl).map((preset) => (
                    <li
                      key={preset.key}
                      className="flex items-start gap-2 text-xs text-foreground-muted"
                    >
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                      <span>
                        {t(`pricingStrategy.${SOURCE_KEY[preset.key]}`)}{" "}
                        <a
                          href={preset.sourceUrl!}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline"
                        >
                          {preset.sourceName}
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-foreground-muted">
                  {t("pricingStrategy.presetsNote")}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        {/* B — overhead + profit */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-3">
            <RadioGroupItem
              value="overhead_profit"
              id={`${idPrefix}-ohp`}
              className="mt-1"
            />
            <div className="grid gap-1">
              <Label htmlFor={`${idPrefix}-ohp`} className="text-sm font-medium">
                {t("pricingStrategy.overheadProfit")}
              </Label>
              <p className="text-xs text-foreground-muted">
                {t("pricingStrategy.overheadProfitHelp")}
              </p>
            </div>
          </div>

          {!isTarget ? (
            <div className="mt-3 grid gap-3 pl-7">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor={`${idPrefix}-oh`} className="text-xs">
                    {t("fields.overheadPct")}
                  </Label>
                  <Input
                    id={`${idPrefix}-oh`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    className="h-11 tabular-nums"
                    value={String(value.overheadPct)}
                    onChange={(e) => onChange({ ...value, overheadPct: num(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor={`${idPrefix}-profit`} className="text-xs">
                    {t("fields.profitPct")}
                  </Label>
                  <Input
                    id={`${idPrefix}-profit`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    className="h-11 tabular-nums"
                    value={String(value.profitPct)}
                    onChange={(e) => onChange({ ...value, profitPct: num(e.target.value) })}
                  />
                </div>
              </div>
              <p className="text-xs text-foreground-muted">
                {t("pricingStrategy.overheadProfitGuidance")}
              </p>
            </div>
          ) : null}
        </div>
      </RadioGroup>
    </div>
  );
}
