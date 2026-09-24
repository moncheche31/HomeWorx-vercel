import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Building2, ImageIcon, Lock, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineError } from "@/components/feedback/InlineError";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { CompanyLogoCard } from "../components/CompanyLogoCard";
import { PricingStrategyCard } from "../components/PricingStrategyCard";
import { MaterialPricingProvidersCard } from "../components/MaterialPricingProvidersCard";

import { useCompanyLogoUrl } from "../hooks/useCompanyLogo";
import { formatPercent, useLocale } from "@/i18n/format";
import { saveOrganization } from "../services/organization.functions";
import { BusinessProfileCard } from "../components/BusinessProfileCard";

const TRADES = [
  "general_contractor",
  "remodeling",
  "handyman",
  "carpentry",
  "roofing",
  "plumbing",
  "electrical",
  "hvac",
  "painting",
  "flooring",
  "tile",
  "masonry",
  "landscaping",
  "other",
] as const;

interface SetupForm {
  organizationName: string;
  businessName: string;
  licenseState: string;
  licenseNumber: string;
  primaryTrade: string;
  phone: string;
  email: string;
  website: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  taxRate: string;
  timezone: string;
  language: string;
  measurementSystem: "imperial" | "metric";
  currency: string;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

export function OrganizationPage() {
  const { t, i18n } = useTranslation("workspace");
  const locale = useLocale();
  const navigate = useNavigate();
  const { organization: o, refreshOrganization } = useWorkspace();
  // Canonical company logo, resolved to a displayable (signed) URL.
  const { url: logoDisplayUrl } = useCompanyLogoUrl(o?.logoUrl ?? null);
  const [skipped, setSkipped] = useState(false);
  const [editing, setEditing] = useState(false);
  /**
   * Form defaults. When a company already exists every field is prefilled from
   * the canonical organization record, so saving an edit never blanks a value
   * the contractor did not touch.
   */
  const initialForm = useMemo<SetupForm>(
    () => ({
      organizationName: o?.organizationName ?? "",
      businessName: o?.businessName ?? "",
      licenseState: o?.licenseState ?? "",
      licenseNumber: o?.licenseNumber ?? "",
      primaryTrade: o?.primaryTrade ?? "",
      phone: o?.phone ?? "",
      email: o?.email ?? "",
      website: o?.website ?? "",
      addressLine1: o?.addressLine1 ?? "",
      addressLine2: o?.addressLine2 ?? "",
      city: o?.city ?? "",
      region: o?.region ?? "",
      postalCode: o?.postalCode ?? "",
      country: o?.country ?? "United States",
      taxRate: o ? String(o.taxRate ?? "") : "",
      timezone: o?.timezone ?? detectTimezone(),
      language: o?.language ?? i18n.language ?? "en-US",
      measurementSystem: o?.measurementSystem ?? "imperial",
      currency: o?.currency ?? "USD",
    }),
    [i18n.language, o],
  );
  const [form, setForm] = useState<SetupForm>(initialForm);
  useEffect(() => {
    if (!editing) setForm(initialForm);
  }, [initialForm, editing]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const save = useServerFn(saveOrganization);
  const isExisting = Boolean(o);

  const mutation = useMutation({
    mutationFn: (data: SetupForm) => {
      const taxRateNum = data.taxRate.trim() === "" ? null : Number(data.taxRate);
      return save({
        data: {
          organizationName: data.organizationName.trim(),
          businessName: data.businessName.trim() || null,
          licenseState: data.licenseState.trim() || null,
          licenseNumber: data.licenseNumber.trim() || null,
          primaryTrade: data.primaryTrade || null,
          phone: data.phone.trim() || null,
          email: data.email.trim() || null,
          website: data.website.trim() || null,
          addressLine1: data.addressLine1.trim() || null,
          addressLine2: data.addressLine2.trim() || null,
          city: data.city.trim() || null,
          region: data.region.trim() || null,
          postalCode: data.postalCode.trim() || null,
          country: data.country.trim() || null,
          taxRate: taxRateNum != null && !Number.isNaN(taxRateNum) ? taxRateNum : null,
          timezone: data.timezone || null,
          language: data.language || null,
          measurementSystem: data.measurementSystem,
          currency: (data.currency || "USD").toUpperCase(),
        },
      });
    },
    onSuccess: async (_result, _vars, _ctx) => {
      setErrorMsg(null);
      const wasEditing = editing;
      setEditing(false);
      toast.success(t("organization.setup.successToast"));
      await refreshOrganization();
      // Only the first-time setup flow continues to the dashboard; editing an
      // existing company stays on the page and shows the saved values.
      if (!wasEditing) navigate({ to: "/app/dashboard" });
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    },
  });


  const set =
    <K extends keyof SetupForm>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((s) => ({ ...s, [k]: e.target.value } as SetupForm));

  if (!o || editing) {
    if (!o && skipped) {
      return (
        <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
          <header className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">{t("organization.title")}</h1>
            <p className="mt-1 text-sm text-foreground-muted">{t("organization.description")}</p>
          </header>
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <Building2 className="size-8 text-foreground-muted" aria-hidden />
              <div>
                <h2 className="text-base font-semibold">{t("organization.emptyState.title")}</h2>
                <p className="mt-1 text-sm text-foreground-muted">
                  {t("organization.emptyState.description")}
                </p>
              </div>
              <Button className="min-h-11" onClick={() => setSkipped(false)}>
                {t("organization.setup.startButton")}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const isValid = form.organizationName.trim().length > 0 && form.primaryTrade.length > 0;
    const isSaving = mutation.isPending;

    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">
            {isExisting
              ? t("organization.edit.title", { defaultValue: "Edit company profile" })
              : t("organization.emptyState.title")}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {isExisting
              ? t("organization.description")
              : t("organization.emptyState.description")}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="size-4 text-primary" aria-hidden />
              {t("organization.emptyState.cta")}
            </CardTitle>
            <CardDescription>{t("organization.setup.optionalHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValid || isSaving) return;
                mutation.mutate(form);
              }}
            >
              <FormField
                id="companyName"
                label={t("organization.setup.fields.companyName")}
                value={form.organizationName}
                onChange={set("organizationName")}
                required
                full
                autoComplete="organization"
              />
              <FormField
                id="dba"
                label={t("organization.setup.fields.dba")}
                value={form.businessName}
                onChange={set("businessName")}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="primaryTrade">
                  {t("organization.setup.fields.primaryTrade")}
                  <span className="ml-0.5 text-danger">*</span>
                </Label>
                <Select
                  value={form.primaryTrade}
                  onValueChange={(v) => setForm((s) => ({ ...s, primaryTrade: v }))}
                >
                  <SelectTrigger id="primaryTrade" className="min-h-11">
                    <SelectValue placeholder={t("organization.setup.fields.primaryTradePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADES.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`organization.setup.trades.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <FormField
                id="phone"
                label={t("organization.setup.fields.phone")}
                value={form.phone}
                onChange={set("phone")}
                type="tel"
                autoComplete="tel"
              />
              <FormField
                id="email"
                label={t("organization.setup.fields.email")}
                value={form.email}
                onChange={set("email")}
                type="email"
                autoComplete="email"
                hint={t("organization.setup.fields.emailHint", {
                  defaultValue:
                    "Customer-facing contact email used on proposals. Not your login email.",
                })}
              />
              <FormField
                id="website"
                label={t("organization.setup.fields.website")}
                value={form.website}
                onChange={set("website")}
                type="url"
                autoComplete="url"
              />
              <FormField
                id="addressLine1"
                label={t("organization.setup.fields.addressLine1")}
                value={form.addressLine1}
                onChange={set("addressLine1")}
                autoComplete="address-line1"
                full
              />
              <FormField
                id="addressLine2"
                label={t("organization.setup.fields.addressLine2")}
                value={form.addressLine2}
                onChange={set("addressLine2")}
                autoComplete="address-line2"
                full
              />
              <FormField
                id="city"
                label={t("organization.setup.fields.city")}
                value={form.city}
                onChange={set("city")}
                autoComplete="address-level2"
              />
              <FormField
                id="region"
                label={t("organization.setup.fields.region")}
                value={form.region}
                onChange={set("region")}
                autoComplete="address-level1"
              />
              <FormField
                id="postalCode"
                label={t("organization.setup.fields.postalCode")}
                value={form.postalCode}
                onChange={set("postalCode")}
                inputMode="numeric"
                autoComplete="postal-code"
              />
              <FormField
                id="country"
                label={t("organization.setup.fields.country")}
                value={form.country}
                onChange={set("country")}
                autoComplete="country-name"
              />
              <FormField
                id="licenseNumber"
                label={t("organization.setup.fields.licenseNumber")}
                value={form.licenseNumber}
                onChange={set("licenseNumber")}
              />
              <FormField
                id="licenseState"
                label={t("organization.setup.fields.licenseState")}
                value={form.licenseState}
                onChange={set("licenseState")}
              />
              <FormField
                id="taxRate"
                label={t("organization.setup.fields.taxRate")}
                value={form.taxRate}
                onChange={set("taxRate")}
                type="number"
                inputMode="decimal"
              />
              <FormField
                id="currency"
                label={t("organization.setup.fields.currency")}
                value={form.currency}
                onChange={set("currency")}
                maxLength={3}
              />
              <FormField
                id="timezone"
                label={t("organization.setup.fields.timezone")}
                value={form.timezone}
                onChange={set("timezone")}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="measurementSystem">
                  {t("organization.setup.fields.measurementSystem")}
                </Label>
                <Select
                  value={form.measurementSystem}
                  onValueChange={(v) =>
                    setForm((s) => ({ ...s, measurementSystem: v as "imperial" | "metric" }))
                  }
                >
                  <SelectTrigger id="measurementSystem" className="min-h-11">
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
              <div className="grid gap-1.5">
                <Label htmlFor="language">{t("organization.setup.fields.language")}</Label>
                <Select
                  value={form.language}
                  onValueChange={(v) => setForm((s) => ({ ...s, language: v }))}
                >
                  <SelectTrigger id="language" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en-US">English (US)</SelectItem>
                    <SelectItem value="es-US">Español (US)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {errorMsg && (
                <div className="sm:col-span-2" role="alert" aria-live="polite">
                  <InlineError message={errorMsg} />
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    if (isExisting) {
                      setEditing(false);
                      setErrorMsg(null);
                      setForm(initialForm);
                    } else {
                      setSkipped(true);
                    }
                  }}
                  disabled={isSaving}
                >
                  {isExisting
                    ? t("organization.edit.cancel", { defaultValue: "Cancel" })
                    : t("organization.setup.skip")}
                </Button>

                <Button
                  type="submit"
                  className="min-h-11"
                  disabled={!isValid || isSaving}
                  aria-busy={isSaving}
                >
                  {isSaving ? t("organization.setup.saving") : t("organization.setup.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const address = [
    o.addressLine1,
    o.addressLine2,
    [o.city, o.region].filter(Boolean).join(", "),
    o.postalCode,
    o.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">{t("organization.title")}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("organization.description")}</p>
      </header>

      <div className="mb-6">
        <CompanyLogoCard logoValue={o.logoUrl} onChanged={refreshOrganization} />
      </div>

      {/* Contractor-internal: company default pricing METHOD for new estimates. */}
      <div className="mb-6">
        <PricingStrategyCard organization={o} onSaved={refreshOrganization} />
      </div>

      {/* Optional live material pricing API credentials. */}
      <div className="mb-6">
        <MaterialPricingProvidersCard />
      </div>


      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-4">
            <div
              aria-hidden
              className="grid size-16 place-items-center rounded-md border border-dashed border-border bg-surface"
              style={{ borderColor: o.brandAccentColor ?? undefined }}
            >
              {logoDisplayUrl ? (
                <img src={logoDisplayUrl} alt="" className="size-full rounded-md object-contain p-1" />
              ) : (
                <ImageIcon className="size-6 text-foreground-muted" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden />
                {o.organizationName}
              </CardTitle>
              <CardDescription>
                {o.logoUrl
                  ? t("organization.fields.logo")
                  : t("empty.noLogo") + " · " + t("organization.logoHint")}
              </CardDescription>
            </div>
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
              {t("organization.edit.edit", { defaultValue: "Edit company profile" })}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label={t("organization.fields.organizationName")} value={o.organizationName} />
          <F label={t("organization.fields.businessName")} value={o.businessName ?? ""} />
          <F label={t("organization.fields.address")} value={address} full />
          <F label={t("organization.fields.phone")} value={o.phone ?? ""} />
          <F label={t("organization.fields.email")} value={o.email ?? ""} />
          <F label={t("organization.fields.website")} value={o.website ?? ""} />
          <F label={t("organization.fields.licenseNumber")} value={o.licenseNumber ?? ""} />
          <F label={t("organization.fields.taxRate")} value={formatPercent(o.taxRate, locale)} />
          <F label={t("organization.fields.currency")} value={o.currency} />
          <F label={t("organization.fields.measurementSystem")} value={o.measurementSystem} />
          <F label={t("organization.fields.timezone")} value={o.timezone} />
          <F label={t("organization.fields.language")} value={o.language} />
          <F
            label={t("organization.fields.brandAccentColor")}
            value={o.brandAccentColor ?? ""}
            hint={t("organization.edit.brandLocked", {
              defaultValue: "Set with your logo and branding assets.",
            })}
          />
          <F
            label={t("organization.fields.networkId")}
            value={o.contractorNetworkId ?? "—"}
            hint={t("organization.edit.networkLocked", {
              defaultValue: "Assigned by VisionWorx360 — not editable.",
            })}
          />
        </CardContent>
      </Card>

      <div className="mt-6">
        <BusinessProfileCard />
      </div>
    </div>
  );
}

function F({
  label,
  value,
  full,
  hint,
}: {
  label: string;
  value: string;
  full?: boolean;
  hint?: string;
}) {
  const id = `o-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={"grid gap-1.5" + (full ? " sm:col-span-2" : "")}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} readOnly value={value} className="min-h-11" />
      {hint ? (
        <p className="flex items-center gap-1 text-xs text-foreground-muted">
          <Lock className="size-3" aria-hidden />
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function FormField({
  id,
  label,
  value,
  onChange,
  type,
  required,
  full,
  autoComplete,
  inputMode,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  full?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel" | "email" | "url" | "search";
  maxLength?: number;
}) {
  return (
    <div className={"grid gap-1.5" + (full ? " sm:col-span-2" : "")}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      <Input
        id={id}
        type={type ?? "text"}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        className="min-h-11"
      />
      {hint ? <p className="text-xs text-foreground-muted">{hint}</p> : null}
    </div>
  );
}
