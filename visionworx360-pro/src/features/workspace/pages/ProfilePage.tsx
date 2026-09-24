import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineError } from "@/components/feedback/InlineError";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { computeInitials } from "../utils/identity";
import { saveProfile, syncAccountEmail } from "../services/profile.functions";
import { accountEmailSchema } from "../services/profile.shared";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "@tanstack/react-router";

interface ProfileForm {
  firstName: string;
  lastName: string;
  displayName: string;
  phone: string;
  language: string;
  timezone: string;
  measurementPreference: "imperial" | "metric";
}

export function ProfilePage() {
  const { t } = useTranslation("workspace");
  const { profile, preferences, refreshOrganization } = useWorkspace();
  const initialsFallback = t("identity.initialsFallback", { defaultValue: "?" });
  const initials = computeInitials(profile.displayName, initialsFallback);
  const save = useServerFn(saveProfile);
  const { user } = useAuth();
  const syncEmail = useServerFn(syncAccountEmail);

  /**
   * The authoritative account email lives in Supabase Auth. When a confirmed
   * change makes the `profiles` mirror stale, refresh it from the verified
   * token claims so the profile and proposals never show a dead address.
   */
  const authEmail = user?.email ?? null;
  const mirroredEmail = profile.email ?? null;
  useEffect(() => {
    if (!authEmail) return;
    if (mirroredEmail && mirroredEmail.toLowerCase() === authEmail.toLowerCase()) return;
    let cancelled = false;
    void (async () => {
      try {
        await syncEmail({ data: undefined as never });
        if (!cancelled) await refreshOrganization();
      } catch {
        // Non-fatal: the auth email still renders from the session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authEmail, mirroredEmail, syncEmail, refreshOrganization]);

  const [editing, setEditing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Values always come FROM the canonical profile; never reset it on load.
  const initialForm = useMemo<ProfileForm>(
    () => ({
      firstName: profile.firstName ?? "",
      lastName: profile.lastName ?? "",
      displayName: profile.displayName ?? "",
      phone: profile.phone ?? "",
      language: profile.language,
      timezone: profile.timezone,
      measurementPreference: profile.measurementPreference,
    }),
    [profile],
  );
  const [form, setForm] = useState<ProfileForm>(initialForm);
  useEffect(() => {
    if (!editing) setForm(initialForm);
  }, [initialForm, editing]);

  const mutation = useMutation({
    mutationFn: (data: ProfileForm) =>
      save({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          displayName: data.displayName,
          phone: data.phone,
          language: data.language || null,
          timezone: data.timezone || null,
          measurementPreference: data.measurementPreference,
        },
      }),
    onSuccess: async () => {
      setErrorMsg(null);
      setEditing(false);
      toast.success(t("profile.edit.savedToast", { defaultValue: "Profile saved." }));
      await refreshOrganization();
    },
    onError: (e: unknown) => setErrorMsg(e instanceof Error ? e.message : String(e)),
  });

  const set =
    <K extends keyof ProfileForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value }) as ProfileForm);

  const isSaving = mutation.isPending;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("profile.description")}</p>
      </header>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-16">
              {profile.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">{profile.displayName}</CardTitle>
              <CardDescription className="truncate">{profile.email ?? ""}</CardDescription>
            </div>
            {!editing && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  setErrorMsg(null);
                  setForm(initialForm);
                  setEditing(true);
                }}
              >
                <Pencil className="mr-2 size-4" aria-hidden />
                {t("profile.edit.edit", { defaultValue: "Edit profile" })}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (isSaving) return;
              mutation.mutate(form);
            }}
          >
            <Field
              label={t("profile.fields.firstName")}
              value={editing ? form.firstName : (profile.firstName ?? "")}
              onChange={set("firstName")}
              readOnly={!editing}
            />
            <Field
              label={t("profile.fields.lastName")}
              value={editing ? form.lastName : (profile.lastName ?? "")}
              onChange={set("lastName")}
              readOnly={!editing}
            />
            <Field
              label={t("profile.fields.displayName")}
              value={editing ? form.displayName : (profile.displayName ?? "")}
              onChange={set("displayName")}
              readOnly={!editing}
            />
            <Field
              label={t("profile.fields.phone")}
              value={editing ? form.phone : (profile.phone ?? "")}
              onChange={set("phone")}
              readOnly={!editing}
              type="tel"
            />
            <Field
              label={t("profile.fields.accountEmail", { defaultValue: "Account (login) email" })}
              value={profile.email ?? ""}
              readOnly
              hint={t("profile.edit.emailLocked", {
                defaultValue: "Managed by your sign-in account. Change it below.",
              })}
            />
            <Field
              label={t("profile.fields.timezone")}
              value={editing ? form.timezone : profile.timezone}
              onChange={set("timezone")}
              readOnly={!editing}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="profile-language">{t("profile.fields.language")}</Label>
              <Select
                value={editing ? form.language : profile.language}
                onValueChange={(v) => setForm((s) => ({ ...s, language: v }))}
                disabled={!editing}
              >
                <SelectTrigger id="profile-language" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en-US">English (US)</SelectItem>
                  <SelectItem value="es-US">Español (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-measurement">{t("profile.fields.measurement")}</Label>
              <Select
                value={editing ? form.measurementPreference : profile.measurementPreference}
                onValueChange={(v) =>
                  setForm((s) => ({ ...s, measurementPreference: v as "imperial" | "metric" }))
                }
                disabled={!editing}
              >
                <SelectTrigger id="profile-measurement" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="imperial">
                    {t("organization.setup.measurement.imperial")}
                  </SelectItem>
                  <SelectItem value="metric">
                    {t("organization.setup.measurement.metric")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label={t("profile.fields.role")}
              value={t(`profile.roles.${profile.role}`)}
              readOnly
              hint={t("profile.edit.roleLocked", {
                defaultValue: "Set by your organization owner.",
              })}
            />

            {errorMsg && (
              <div className="sm:col-span-2" role="alert" aria-live="polite">
                <InlineError message={errorMsg} />
              </div>
            )}

            {editing && (
              <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={isSaving}
                  onClick={() => {
                    setEditing(false);
                    setErrorMsg(null);
                    setForm(initialForm);
                  }}
                >
                  {t("profile.edit.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={isSaving}
                  aria-busy={isSaving}
                >
                  {isSaving
                    ? t("profile.edit.saving", { defaultValue: "Saving…" })
                    : t("profile.edit.save", { defaultValue: "Save changes" })}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <AccountEmailCard currentEmail={profile.email ?? ""} />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{t("profile.notifications.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PrefRow
            label={t("profile.notifications.email")}
            value={preferences.notificationEmail}
            id="pref-email"
          />
          <PrefRow
            label={t("profile.notifications.push")}
            value={preferences.notificationPush}
            id="pref-push"
          />
          <PrefRow
            label={t("profile.notifications.sms")}
            value={preferences.notificationSms}
            id="pref-sms"
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Account (login) email. This is the authentication identity, distinct from
 * the customer-facing company contact email used on proposals. Changing it
 * goes through Supabase Auth, which emails a confirmation link — the address
 * is not switched until that link is opened.
 */
function AccountEmailCard({ currentEmail }: { currentEmail: string }) {
  const { t } = useTranslation("workspace");
  const { requestEmailChange } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const parsed = accountEmailSchema.safeParse({ email: value });
    if (!parsed.success) {
      setError(t("profile.accountEmail.invalid", { defaultValue: "Enter a valid email address." }));
      return;
    }
    if (parsed.data.email.toLowerCase() === currentEmail.trim().toLowerCase()) {
      setError(
        t("profile.accountEmail.unchanged", {
          defaultValue: "That is already your account email.",
        }),
      );
      return;
    }
    setError(null);
    setPending(true);
    const failure = await requestEmailChange(parsed.data.email);
    setPending(false);
    if (failure) {
      setError(
        t(`profile.accountEmail.errors.${failure.category}`, {
          defaultValue: t("profile.accountEmail.errors.unknown", {
            defaultValue: "We could not start the email change. Please try again.",
          }),
        }),
      );
      return;
    }
    setSentTo(parsed.data.email);
    setEditing(false);
    toast.success(
      t("profile.accountEmail.sentToast", { defaultValue: "Confirmation email sent." }),
    );
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">
          {t("profile.accountEmail.title", { defaultValue: "Account (login) email" })}
        </CardTitle>
        <CardDescription>
          {t("profile.accountEmail.description", {
            defaultValue:
              "This is the address you sign in with. It is separate from the company contact email shown to customers on proposals.",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border border-border bg-surface px-3 py-3 text-sm text-foreground">
          {currentEmail || "—"}
        </div>
        {sentTo && (
          <p className="text-sm text-foreground-muted" role="status">
            {t("profile.accountEmail.pending", {
              defaultValue:
                "Check {{email}} for a confirmation link. Your login email changes only after you confirm it.",
              email: sentTo,
            })}
          </p>
        )}
        {editing ? (
          <form className="space-y-3" noValidate onSubmit={submit}>
            <div className="grid gap-1.5">
              <Label htmlFor="account-email-new">
                {t("profile.accountEmail.newLabel", { defaultValue: "New account email" })}
              </Label>
              <Input
                id="account-email-new"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="min-h-11"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <p className="text-xs text-foreground-muted">
                {t("profile.accountEmail.verificationNote", {
                  defaultValue:
                    "Verification is required: we email a confirmation link to the new address.",
                })}
              </p>
            </div>
            {error && (
              <div role="alert" aria-live="polite">
                <InlineError message={error} />
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                className="min-h-11"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setValue(currentEmail);
                }}
              >
                {t("profile.edit.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button type="submit" className="min-h-11" disabled={pending} aria-busy={pending}>
                {pending
                  ? t("profile.accountEmail.sending", { defaultValue: "Sending…" })
                  : t("profile.accountEmail.submit", { defaultValue: "Send confirmation" })}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setError(null);
                setValue(currentEmail);
                setEditing(true);
              }}
            >
              <Pencil className="mr-2 size-4" aria-hidden />
              {t("profile.accountEmail.change", { defaultValue: "Change account email" })}
            </Button>
            <Button asChild variant="ghost" className="min-h-11">
              <Link to="/app/organization">
                {t("profile.accountEmail.companyLink", {
                  defaultValue: "Edit company contact email",
                })}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  readOnly,
  type,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  type?: string;
  hint?: string;
}) {
  const id = `f-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type ?? "text"}
        readOnly={readOnly}
        value={value}
        onChange={onChange}
        className="min-h-11"
      />
      {hint ? (
        <p className="flex items-center gap-1 text-xs text-foreground-muted">
          <Lock className="size-3" aria-hidden />
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PrefRow({ label, value, id }: { label: string; value: boolean; id: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-3">
      <Label htmlFor={id} className="cursor-pointer text-sm text-foreground">
        {label}
      </Label>
      <Switch id={id} checked={value} disabled aria-readonly />
    </div>
  );
}
