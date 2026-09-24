import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BrandMark } from "@/components/brand/BrandMark";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { loginSchema, type LoginValues } from "@/features/auth/validation/schemas";
import { sanitizeRedirect } from "@/lib/auth/safeRedirect";
import { cn } from "@/lib/utils";
import type { SafeAuthError } from "@/features/auth/types/auth";
import { logger } from "@/lib/logging/logger";

export function LoginPage({ onAuthenticated }: { onAuthenticated?: () => Promise<void> | void }) {
  const { t } = useTranslation(["auth", "common", "errors"]);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { redirect?: string };
  const { signInWithPassword, status, session } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<SafeAuthError | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const emailErrorId = `${emailId}-err`;
  const passwordErrorId = `${passwordId}-err`;

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  const { register, handleSubmit, formState } = form;
  const submitting = formState.isSubmitting;

  useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const target = pendingTarget ?? sanitizeRedirect(search?.redirect, "/app");
    void (async () => {
      await onAuthenticated?.();
      logger.info("auth_lifecycle", {
        event: "authenticated ready; redirecting",
        timestamp: new Date().toISOString(),
        destination: target,
        sessionPresent: true,
      });
      await navigate({ to: target, replace: true });
    })();
  }, [navigate, onAuthenticated, pendingTarget, search?.redirect, session, status]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const err = await signInWithPassword(values.email, values.password);
    if (err) {
      setFormError(err);
      return;
    }
    const target = sanitizeRedirect(search?.redirect, "/app");
    setPendingTarget(target);
  });

  const fieldError = (key: keyof LoginValues) => {
    const msg = formState.errors[key]?.message as string | undefined;
    if (!msg) return null;
    return t(`auth:validation.${msg}`);
  };

  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-md flex-col">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="text-sm text-foreground-muted hover:text-foreground">
            {t("common:actions.backHome")}
          </Link>
          <LanguageSwitcher variant="compact" />
        </div>

        <div className="mt-6 flex justify-center">
          <BrandMark variant="compact" />
        </div>

        <h1 className="mt-6 text-center text-2xl font-semibold tracking-tight text-foreground">
          {t("auth:login.title")}
        </h1>
        <p className="mt-2 text-center text-sm text-foreground-muted">
          {t("auth:login.description")}
        </p>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-label={t("auth:login.formLabel")}
          className="mt-6 flex flex-col gap-4"
        >
          {/* Form-level error live region */}
          <div role="alert" aria-live="assertive" data-testid="form-error">
            {formError && (
              <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                <p>{t(`auth:errors.${formError.category}`)}</p>
                {formError.category === "unknown" && (
                  <p className="mt-1 text-xs text-danger/80">
                    {t("errors:referenceShort")}: <code>{formError.referenceId}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor={emailId} className="block text-sm font-medium text-foreground">
              {t("auth:fields.email")}
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="username"


              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!formState.errors.email}
              aria-describedby={formState.errors.email ? emailErrorId : undefined}
              disabled={submitting}
              {...register("email")}
              className={cn(
                "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                formState.errors.email && "border-danger",
              )}
            />
            {fieldError("email") && (
              <p id={emailErrorId} className="mt-1 text-xs text-danger">
                {fieldError("email")}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor={passwordId} className="block text-sm font-medium text-foreground">
                {t("auth:fields.password")}
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("auth:login.forgotLink")}
              </Link>
            </div>
            <div className="relative mt-1">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={!!formState.errors.password}
                aria-describedby={formState.errors.password ? passwordErrorId : undefined}
                disabled={submitting}
                {...register("password")}
                className={cn(
                  "block min-h-11 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                  formState.errors.password && "border-danger",
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={
                  showPassword ? t("auth:password.hide") : t("auth:password.show")
                }
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            {fieldError("password") && (
              <p id={passwordErrorId} className="mt-1 text-xs text-danger">
                {fieldError("password")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {submitting ? t("auth:login.submitting") : t("auth:login.submit")}
          </button>

          <p className="mt-2 text-center text-sm text-foreground-muted">
            {t("auth:login.noAccount")}{" "}
            <Link to="/register" search={{ redirect: undefined }} className="font-medium text-primary hover:underline">
              {t("auth:login.registerLink")}
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-foreground-muted">
          {t("auth:login.sessionNote")}
        </p>
      </div>
    </main>
  );
}
