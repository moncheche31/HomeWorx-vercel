import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICING_MODES, type PricingMode } from "@/domains/estimating/pricingModes";

/**
 * How the contractor sells this job. Presentation only: the estimate itself —
 * scope, quantities, assumptions, labor model and pricing history — is
 * identical in every mode, so switching is always safe.
 */
export function PricingModeSelector({
  mode,
  disabled,
  onChange,
}: {
  mode: PricingMode;
  disabled?: boolean;
  onChange: (mode: PricingMode) => void;
}) {
  const { t } = useTranslation("estimating");

  return (
    <div className="grid gap-1" data-testid="pricing-mode-selector">
      <Label htmlFor="pricing-mode" className="text-xs text-foreground-muted">
        {t("pricingMode.label")}
      </Label>
      <Select
        value={mode}
        disabled={disabled}
        onValueChange={(v) => onChange(v as PricingMode)}
      >
        <SelectTrigger id="pricing-mode" className="h-11 min-w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRICING_MODES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`pricingMode.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-foreground-muted">{t(`pricingMode.${mode}Help`)}</p>
    </div>
  );
}
