import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
  label?: string;
}

export function LoadingSkeleton({ className, lines = 1, label }: LoadingSkeletonProps) {
  const { t } = useTranslation("common");
  const text = label ?? t("status.loading");
  if (lines > 1) {
    return (
      <div role="status" aria-live="polite" className={cn("space-y-2", className)}>
        <span className="sr-only">{text}</span>
        {Array.from({ length: lines }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className="block h-3 w-full rounded bg-muted motion-safe:animate-pulse"
            style={{ width: `${100 - i * 8}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("block h-3 w-full rounded bg-muted motion-safe:animate-pulse", className)}
    >
      <span className="sr-only">{text}</span>
    </span>
  );
}
