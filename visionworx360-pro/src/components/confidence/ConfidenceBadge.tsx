import { AlertCircle, CheckCircle2, Circle, CircleDot, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConfidenceLevel } from "@/types/confidence";
import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  className?: string;
  showLabel?: boolean;
}

const iconMap: Record<ConfidenceLevel, typeof Circle> = {
  verified: CheckCircle2,
  high: CircleDot,
  medium: Circle,
  low: AlertCircle,
  needs_confirmation: HelpCircle,
};

const toneMap: Record<ConfidenceLevel, string> = {
  verified:
    "border-[color:var(--confidence-verified)]/40 bg-[color:var(--confidence-verified)]/10 text-[color:var(--confidence-verified)]",
  high: "border-[color:var(--confidence-high)]/40 bg-[color:var(--confidence-high)]/10 text-[color:var(--confidence-high)]",
  medium:
    "border-[color:var(--confidence-medium)]/50 bg-[color:var(--confidence-medium)]/15 text-[color:var(--confidence-medium)]",
  low: "border-[color:var(--confidence-low)]/50 bg-[color:var(--confidence-low)]/15 text-[color:var(--confidence-low)]",
  needs_confirmation:
    "border-[color:var(--confidence-needs-confirmation)]/50 bg-[color:var(--confidence-needs-confirmation)]/10 text-[color:var(--confidence-needs-confirmation)]",
};

export function ConfidenceBadge({ level, className, showLabel = true }: ConfidenceBadgeProps) {
  const { t } = useTranslation("confidence");
  const Icon = iconMap[level];
  const label = t(`levels.${level}.label`);
  const explanation = t(`levels.${level}.explanation`);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        toneMap[level],
        className,
      )}
      title={explanation}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className={showLabel ? undefined : "sr-only"}>{label}</span>
      <span className="sr-only">— {explanation}</span>
    </span>
  );
}
