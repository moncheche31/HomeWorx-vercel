import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Pause,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type VoiceActionState =
  | "idle"
  | "listening"
  | "paused"
  | "processing"
  | "complete"
  | "permission_denied"
  | "error"
  | "disabled";

interface VoiceActionButtonProps {
  state: VoiceActionState;
  onActivate?: () => void;
  variant?: "primary" | "compact";
  label?: string;
  className?: string;
}

const iconMap: Record<VoiceActionState, typeof Mic> = {
  idle: Mic,
  listening: Mic,
  paused: Pause,
  processing: Loader2,
  complete: CheckCircle2,
  permission_denied: ShieldAlert,
  error: TriangleAlert,
  disabled: MicOff,
};

const toneMap: Record<VoiceActionState, { tone: string; pulse?: boolean }> = {
  idle: { tone: "bg-primary text-primary-foreground hover:bg-primary/90" },
  listening: {
    tone: "bg-danger text-danger-foreground hover:bg-danger/90",
    pulse: true,
  },
  paused: {
    tone: "bg-warning text-[color:var(--warning-foreground)] hover:brightness-95",
  },
  processing: { tone: "bg-primary/80 text-primary-foreground" },
  complete: { tone: "bg-success text-success-foreground" },
  permission_denied: { tone: "bg-surface text-foreground border border-danger/50" },
  error: { tone: "bg-surface text-foreground border border-danger/50" },
  disabled: { tone: "bg-disabled text-disabled-foreground" },
};

export const VoiceActionButton = forwardRef<HTMLButtonElement, VoiceActionButtonProps>(
  function VoiceActionButton({ state, onActivate, variant = "primary", label, className }, ref) {
    const { t } = useTranslation("voice");
    const Icon = iconMap[state];
    const cfg = toneMap[state];
    const disabled = state === "disabled" || state === "processing" || state === "complete";
    const isCompact = variant === "compact";
    const isProcessing = state === "processing";
    const text = t(`states.${state}.text`);
    const aria = t(`states.${state}.aria`);

    return (
      <button
        ref={ref}
        type="button"
        onClick={onActivate}
        disabled={disabled}
        aria-label={label ?? aria}
        aria-pressed={state === "listening"}
        aria-busy={isProcessing || undefined}
        data-state={state}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed",
          isCompact ? "min-h-11 min-w-11 px-4 text-sm" : "min-h-14 min-w-14 px-6 text-base",
          cfg.tone,
          cfg.pulse && "motion-safe:animate-pulse",
          className,
        )}
      >
        <Icon
          aria-hidden
          className={cn(
            isCompact ? "size-4" : "size-5",
            isProcessing && "animate-spin motion-reduce:animate-none",
          )}
        />
        <span>{label ?? text}</span>
      </button>
    );
  },
);
