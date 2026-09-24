import { RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RetryPanelProps {
  title?: string;
  description?: string;
  onRetry: () => void;
  retryLabel?: string;
  referenceId?: string;
  className?: string;
}

export function RetryPanel({
  title,
  description,
  onRetry,
  retryLabel,
  referenceId,
  className,
}: RetryPanelProps) {
  const { t } = useTranslation("errors");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-border bg-surface px-6 py-8 text-center",
        className,
      )}
    >
      <h3 className="text-base font-semibold text-foreground">{title ?? t("retry.title")}</h3>
      <p className="max-w-sm text-sm text-foreground-muted">
        {description ?? t("retry.description")}
      </p>
      <Button onClick={onRetry} size="lg" className="min-h-11 gap-2">
        <RotateCw aria-hidden />
        {retryLabel ?? t("retry.action")}
      </Button>
      {referenceId && (
        <p className="text-xs text-foreground-muted">
          {t("referenceShort")}:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{referenceId}</code>
        </p>
      )}
    </div>
  );
}
