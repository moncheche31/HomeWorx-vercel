import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { BrandMark } from "@/components/brand/BrandMark";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { registerSchema, type RegisterValues } from "@/features/auth/validation/schemas";
import { PasswordRequirements } from "@/features/auth/components/PasswordRequirements";
import { EmailConfirmationState } from "@/features/auth/components/EmailConfirmationState";
import { cn } from "@/lib/utils";
import type { SafeAuthError } from "@/features/auth/types/auth";
import { queueSignupLegalAcceptance } from "@/features/legal/acceptance";

export function RegisterPage() {
  const { t, i18n } = useTranslation(["auth", "common", "errors"]);
  const navigate = useNavigate();
  const { signUpWithPassword, resendConfirmation } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState<SafeAuthError | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const firstNameId = useId();
  const lastNameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const termsId = useId();
  const reqId = useId();

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: "onSubmit",
    reValidateMode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  const { register, handleSubmit, formState, watch } = form;
  const submitting = formState.isSubmitting;
  const passwordValue = watch("password") ?? "";

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    /* Queue the accepted document key/version now; flushed once authenticated. */
    queueSignupLegalAcceptance(i18n.language || "en-US");
    const result = await signUpWithPassword(values.email, values.password, {
      first_name: values.firstName.trim(),
      last_name: values.lastName.trim(),
      preferred_locale: i18n.language || "en-US",
    });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    if (result.requiresEmailConfirmation) {
      setConfirmationEmail(values.email);
      return;
    }
    void navigate({ to: "/app", replace: true });
  });

  const fieldError = (key: keyof RegisterValues) => {
    const msg = formState.errors[key]?.message as string | undefined;
    if (!msg) return null;
    return t(`auth:validation.${msg}`);
  };

  if (confirmationEmail) {
    return (
      <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="text-sm text-foreground-muted hover:text-foreground">
              {t("common:actions.backHome")}
            </Link>
            <LanguageSwitcher variant="compact" />
          </div>
          <div className="mt-6 flex justify-center">
            <BrandMark variant="compact" />
          </div>
          <div className="mt-8">
            <EmailConfirmationState
              email={confirmationEmail}
              onResend={resendConfirmation}
            />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="safe-top safe-bottom min-h-dvh bg-background px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-md">
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
          {t("auth:register.title")}
        </h1>
        <p className="mt-2 text-center text-sm text-foreground-muted">
          {t("auth:register.description")}
        </p>

        <form
          noValidate
          onSubmit={onSubmit}
          aria-label={t("auth:register.formLabel")}
          className="mt-6 flex flex-col gap-4"
        >
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={firstNameId} className="block text-sm font-medium text-foreground">
                {t("auth:fields.firstName")}
              </label>
              <input
                id={firstNameId}
                type="text"
                autoComplete="given-name"
                aria-invalid={!!formState.errors.firstName}
                aria-describedby={
                  formState.errors.firstName ? `${firstNameId}-err` : undefined
                }
                disabled={submitting}
                {...register("firstName")}
                className={cn(
                  "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
                  formState.errors.firstName && "border-danger",
                )}
              />
              {fieldError("firstName") && (
                <p id={`${firstNameId}-err`} className="mt-1 text-xs text-danger">
                  {fieldError("firstName")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={lastNameId} className="block text-sm font-medium text-foreground">
                {t("auth:fields.lastName")}
              </label>
              <input
                id={lastNameId}
                type="text"
                autoComplete="family-name"
                aria-invalid={!!formState.errors.lastName}
                aria-describedby={
                  formState.errors.lastName ? `${lastNameId}-err` : undefined
                }
                disabled={submitting}
                {...register("lastName")}
                className={cn(
                  "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
                  formState.errors.lastName && "border-danger",
                )}
              />
              {fieldError("lastName") && (
                <p id={`${lastNameId}-err`} className="mt-1 text-xs text-danger">
                  {fieldError("lastName")}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor={emailId} className="block text-sm font-medium text-foreground">
              {t("auth:fields.email")}
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={!!formState.errors.email}
              aria-describedby={formState.errors.email ? `${emailId}-err` : undefined}
              disabled={submitting}
              {...register("email")}
              className={cn(
                "mt-1 block min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground",
                formState.errors.email && "border-danger",
              )}
            />
            {fieldError("email") && (
              <p id={`${emailId}-err`} className="mt-1 text-xs text-danger">
                {fieldError("email")}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={passwordId} className="block text-sm font-medium text-foreground">
              {t("auth:fields.password")}
            </label>
            <div className="relative mt-1">
              <input
                id={passwordId}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!formState.errors.password}
                aria-describedby={cn(
                  reqId,
                  formState.errors.password && `${passwordId}-err`,
                )}
                disabled={submitting}
                {...register("password")}
                className={cn(
                  "block min-h-11 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground",
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
              <p id={`${passwordId}-err`} className="mt-1 text-xs text-danger">
                {fieldError("password")}
              </p>
            )}
            <PasswordRequirements id={reqId} value={passwordValue} />
            <p className="mt-1 text-xs text-foreground-muted">
              {t("auth:password.strengthNote")}
            </p>
          </div>

          <div>
            <label htmlFor={confirmId} className="block text-sm font-medium text-foreground">
              {t("auth:fields.confirmPassword")}
            </label>
            <div className="relative mt-1">
              <input
                id={confirmId}
                type={showConfirm ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!formState.errors.confirmPassword}
                aria-describedby={
                  formState.errors.confirmPassword ? `${confirmId}-err` : undefined
                }
                disabled={submitting}
                {...register("confirmPassword")}
                className={cn(
                  "block min-h-11 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground",
                  formState.errors.confirmPassword && "border-danger",
                )}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((s) => !s)}
                aria-label={
                  showConfirm ? t("auth:password.hide") : t("auth:password.show")
                }
                aria-pressed={showConfirm}
                className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-r-md text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {showConfirm ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            {fieldError("confirmPassword") && (
              <p id={`${confirmId}-err`} className="mt-1 text-xs text-danger">
                {fieldError("confirmPassword")}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-start gap-3">
              <input
                id={termsId}
                type="checkbox"
                aria-invalid={!!formState.errors.acceptTerms}
                aria-describedby={
                  formState.errors.acceptTerms ? `${termsId}-err` : undefined
                }
                disabled={submitting}
                {...register("acceptTerms")}
                className="mt-1 size-5 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
              />
              <label htmlFor={termsId} className="text-sm text-foreground">
                {t("auth:register.terms.prefix")}{" "}
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {t("auth:register.terms.tos")}
                </a>{" "}
                {t("auth:register.terms.and")}{" "}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {t("auth:register.terms.privacy")}
                </a>
                .
              </label>
            </div>
            {fieldError("acceptTerms") && (
              <p id={`${termsId}-err`} className="mt-1 text-xs text-danger">
                {fieldError("acceptTerms")}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {submitting ? t("auth:register.submitting") : t("auth:register.submit")}
          </button>

          <p className="mt-2 text-center text-sm text-foreground-muted">
            {t("auth:register.haveAccount")}{" "}
            <Link to="/login" search={{ redirect: undefined }} className="font-medium text-primary hover:underline">
              {t("auth:register.loginLink")}
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
