import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/format";
import { formatMoney } from "../utils/format";
import { cn } from "@/lib/utils";

export interface ProjectBallparkRangeProps {
  low?: number | null;
  high?: number | null;
  currency?: string | null;
  className?: string;
}

/**
 * Display-only rendering of a project's canonical saved band on list cards.
 * It never computes or repairs pricing — if the current estimate has no band,
 * the card says so instead of implying $0.
 */
export function ProjectBallparkRange({
  low,
  high,
  currency,
  className,
}: ProjectBallparkRangeProps) {
  const { t } = useTranslation("crm");
  const locale = useLocale();
  const hasBand =
    typeof low === "number" &&
    Number.isFinite(low) &&
    typeof high === "number" &&
    Number.isFinite(high);

  if (!hasBand) {
    return (
      <div className={cn("text-xs text-foreground-muted", className)}>
        {t("project.fields.noEstimate")}
      </div>
    );
  }

  const cur = currency || "USD";
  return (
    <div
      className={cn("text-sm font-semibold tabular-nums", className)}
      aria-label={t("project.fields.ballparkRange")}
    >
      {formatMoney(low, cur, locale)} – {formatMoney(high, cur, locale)}
    </div>
  );
}
