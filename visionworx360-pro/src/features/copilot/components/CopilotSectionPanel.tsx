import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { CopilotDecision, CopilotDecisionMap, CopilotSection } from "@/domains/copilot";
import { CopilotRecommendationCard } from "./CopilotRecommendationCard";

interface Props {
  section: CopilotSection;
  decisions: CopilotDecisionMap;
  mode: "contractor" | "customer";
  onDecide: (id: string, decision: CopilotDecision) => void;
  onAcceptAll: (ids: string[]) => void;
}

export function CopilotSectionPanel({ section, decisions, mode, onDecide, onAcceptAll }: Props) {
  const { t } = useTranslation("copilot");
  if (section.recommendations.length === 0) return null;

  const visible =
    mode === "customer"
      ? section.recommendations.filter(
          (r) => (decisions[r.id] ?? r.defaultDecision) === "accepted",
        )
      : section.recommendations;

  if (visible.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">
          {t(`sections.${section.key}.${mode === "customer" ? "customerTitle" : "title"}`)}
        </h3>
        <p className="text-sm text-foreground-muted">
          {t(`sections.${section.key}.${mode === "customer" ? "customerLead" : "lead"}`)}
        </p>
      </div>

      {mode === "contractor" ? (
        <Button
          variant="outline"
          className="min-h-11 w-full"
          onClick={() => onAcceptAll(section.recommendations.map((r) => r.id))}
        >
          {t("actions.acceptAll")}
        </Button>
      ) : null}

      <div className="space-y-3">
        {visible.map((rec) => (
          <CopilotRecommendationCard
            key={rec.id}
            recommendation={rec}
            decision={decisions[rec.id] ?? rec.defaultDecision}
            mode={mode}
            onDecide={(decision) => onDecide(rec.id, decision)}
          />
        ))}
      </div>
    </section>
  );
}
