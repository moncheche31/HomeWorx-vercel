import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { maskEmail } from "../utils/maskEmail";
import type { SafeAuthError } from "../types/auth";

interface Props {
  email: string;
  onResend?: (email: string) => Promise<SafeAuthError | null>;
  cooldownSeconds?: number;
}

export function EmailConfirmationState({ email, onResend, cooldownSeconds = 60 }: Props) {
  const { t } = useTranslation(["auth", "common"]);
  const [remaining, setRemaining] = useState(cooldownSeconds);
  const [resending, setResending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (remaining <= 0) return;
    timerRef.current = setInterval(() => {
      setRemaining((r) => (r <= 1 ? 0 : r - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [remaining]);

  const canResend = onResend && remaining <= 0 && !resending;

  const handleResend = async () => {
    if (!onResend || resending || remaining > 0) return;
    setResending(true);
    setFeedback(null);
    const err = await onResend(email);
    setResending(false);
    if (err) {
      setFeedback({
        kind: "error",
        message: t(`auth:errors.${err.category}`),
      });
    } else {
      setFeedback({
        kind: "success",
        message: t("auth:confirmation.resendSuccess"),
      });
      setRemaining(cooldownSeconds);
    }
  };

  return (
    <div className="text-center" data-testid="email-confirmation-state">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10">
        <MailCheck className="size-6 text-success" aria-hidden />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-foreground">
        {t("auth:confirmation.title")}
      </h2>
      <p className="mt-2 text-sm text-foreground-muted">
        {t("auth:confirmation.description")}
      </p>
      <p className="mt-3 text-sm font-medium text-foreground" aria-label={t("auth:confirmation.sentToLabel")}>
        <span aria-hidden>{maskEmail(email)}</span>
        <span className="sr-only">{t("auth:confirmation.emailMasked")}</span>
      </p>
      <p className="mt-3 text-xs text-foreground-muted">
        {t("auth:confirmation.spamHint")}
      </p>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={
            feedback.kind === "success"
              ? "mt-4 text-sm text-success"
              : "mt-4 text-sm text-danger"
          }
        >
          {feedback.message}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {onResend && (
          <button
            type="button"
            onClick={handleResend}
            disabled={!canResend}
            aria-describedby="resend-hint"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {resending
              ? t("auth:confirmation.resending")
              : remaining > 0
                ? t("auth:confirmation.resendCooldown", { seconds: remaining })
                : t("auth:confirmation.resend")}
          </button>
        )}
        <p id="resend-hint" className="sr-only">
          {t("auth:confirmation.resendHint")}
        </p>
        <Link
          to="/login"
          search={{ redirect: undefined }}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {t("auth:confirmation.returnToLogin")}
        </Link>
      </div>
    </div>
  );
}
