import { AlertCircle, CircleDot, Circle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CopilotConfidence } from "@/domains/copilot";
import { cn } from "@/lib/utils";

const iconMap: Record<CopilotConfidence, typeof Circle> = {
  high: CircleDot,
  medium: Circle,
  optional: Sparkles,
  contractor_decision: AlertCircle,
};

const toneMap: Record<CopilotConfidence, string> = {
  high: "border-[color:var(--confidence-high)]/40 bg-[color:var(--confidence-high)]/10 text-[color:var(--confidence-high)]",
  medium:
    "border-[color:var(--confidence-medium)]/50 bg-[color:var(--confidence-medium)]/15 text-[color:var(--confidence-medium)]",
  optional:
    "border-[color:var(--confidence-verified)]/40 bg-[color:var(--confidence-verified)]/10 text-[color:var(--confidence-verified)]",
  contractor_decision:
    "border-[color:var(--confidence-low)]/50 bg-[color:var(--confidence-low)]/15 text-[color:var(--confidence-low)]",
};

export function CopilotConfidenceBadge({
  level,
  className,
}: {
  level: CopilotConfidence;
  className?: string;
}) {
  const { t } = useTranslation("copilot");
  const Icon = iconMap[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneMap[level],
        className,
      )}
      title={t(`confidence.${level}.explanation`)}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`confidence.${level}.label`)}
      <span className="sr-only">— {t(`confidence.${level}.explanation`)}</span>
    </span>
  );
}
