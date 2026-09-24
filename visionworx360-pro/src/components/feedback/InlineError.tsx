import { useTranslation } from "react-i18next";

interface InlineErrorProps {
  message: string;
  referenceId?: string;
  onRetry?: () => void;
}

export function InlineError({ message, referenceId, onRetry }: InlineErrorProps) {
  const { t } = useTranslation(["errors", "common"]);
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
    >
      <p className="text-destructive-foreground">{message}</p>
      {referenceId && (
        <p className="mt-1 text-xs text-muted-foreground">
          {t("referenceShort")}: {referenceId}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex min-h-[44px] items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("common:actions.tryAgain")}
        </button>
      )}
    </div>
  );
}
