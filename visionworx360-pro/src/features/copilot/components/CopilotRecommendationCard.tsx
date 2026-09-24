import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CopilotDecision, CopilotRecommendation } from "@/domains/copilot";
import { CopilotConfidenceBadge } from "./CopilotConfidenceBadge";

interface Props {
  recommendation: CopilotRecommendation;
  decision: CopilotDecision;
  mode: "contractor" | "customer";
  onDecide: (decision: CopilotDecision) => void;
}

export function CopilotRecommendationCard({ recommendation, decision, mode, onDecide }: Props) {
  const { t } = useTranslation("copilot");
  const isCustomer = mode === "customer";
  const title = isCustomer ? recommendation.customerLabel : recommendation.label;
  const body = isCustomer ? recommendation.customerRationale : recommendation.rationale;

  return (
    <Card
      className={cn(
        "transition-colors",
        decision === "accepted" && "border-[color:var(--confidence-high)]/50",
        decision === "removed" && "opacity-60",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1.5">
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="text-sm text-foreground-muted">{body}</p>
          {!isCustomer ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <CopilotConfidenceBadge level={recommendation.confidence} />
              {recommendation.valueEngineering ? (
                <span className="text-xs font-medium text-foreground-muted">
                  {t("savings", { pct: recommendation.valueEngineering.savingsPct })}
                </span>
              ) : null}
              {recommendation.typicalPriceRange ? (
                <span className="text-xs font-medium text-foreground-muted">
                  {t("typicalRange", {
                    low: recommendation.typicalPriceRange.low,
                    high: recommendation.typicalPriceRange.high,
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {!isCustomer ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={decision === "accepted" ? "default" : "outline"}
              className="min-h-11"
              onClick={() => onDecide("accepted")}
            >
              <Check className="mr-2 size-4" aria-hidden />
              {decision === "accepted" ? t("actions.accepted") : t("actions.accept")}
            </Button>
            <Button
              variant={decision === "removed" ? "secondary" : "ghost"}
              className="min-h-11"
              onClick={() => onDecide("removed")}
            >
              <X className="mr-2 size-4" aria-hidden />
              {recommendation.sectionKey === "standard_items"
                ? t("actions.remove")
                : t("actions.ignore")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
