import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({ label, size = "md", className }: LoadingSpinnerProps) {
  const { t } = useTranslation("common");
  const sizeClass = size === "sm" ? "size-4" : size === "lg" ? "size-8" : "size-5";
  const text = label ?? t("actions.tryAgain", { defaultValue: "Loading" });
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-2 text-foreground-muted", className)}
    >
      <Loader2 className={cn(sizeClass, "animate-spin motion-reduce:animate-none")} aria-hidden />
      <span className="sr-only">{label ?? text}</span>
    </span>
  );
}
