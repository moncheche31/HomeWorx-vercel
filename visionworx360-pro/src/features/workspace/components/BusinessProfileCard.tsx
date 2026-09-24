import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineError } from "@/components/feedback/InlineError";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { saveBusinessProfile } from "../services/business-profile.functions";
import {
  PRIMARY_BUSINESS_TYPES,
  PREFERRED_PROJECT_SCALES,
  type PrimaryBusinessType,
  type PreferredProjectScaleKey,
  isPrimaryBusinessType,
  isPreferredProjectScaleKey,
} from "@/features/crm/catalog/businessProfile";
import { PROJECT_CATEGORY_KEYS } from "@/features/crm/catalog/projectTypes";

const EDITOR_ROLES = new Set(["owner", "administrator"]);

export function BusinessProfileCard() {
  const { t } = useTranslation("workspace");
  const { organization, profile, refreshOrganization } = useWorkspace();
  const save = useServerFn(saveBusinessProfile);

  const canEdit = !!profile && EDITOR_ROLES.has(profile.role);

  const [primary, setPrimary] = useState<PrimaryBusinessType | "">(
    isPrimaryBusinessType(organization?.primaryBusinessType)
      ? (organization!.primaryBusinessType as PrimaryBusinessType)
      : "",
  );
  const [secondary, setSecondary] = useState<Set<PrimaryBusinessType>>(
    new Set(
      (organization?.secondaryBusinessTypes ?? []).filter(isPrimaryBusinessType) as PrimaryBusinessType[],
    ),
  );
  const [specialties, setSpecialties] = useState<Set<string>>(
    new Set(organization?.serviceSpecialties ?? []),
  );
  const [scale, setScale] = useState<PreferredProjectScaleKey | "">(
    isPreferredProjectScaleKey(organization?.preferredProjectScale)
      ? (organization!.preferredProjectScale as PreferredProjectScaleKey)
      : "",
  );
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          primaryBusinessType: primary || null,
          secondaryBusinessTypes: Array.from(secondary),
          serviceSpecialties: Array.from(specialties),
          preferredProjectScale: scale || null,
        },
      }),
    onSuccess: async () => {
      setErr(null);
      toast.success(t("businessProfile.toastSaved"));
      await refreshOrganization();
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  const secondaryOptions = useMemo(
    () => PRIMARY_BUSINESS_TYPES.filter((k) => k !== primary),
    [primary],
  );

  const toggle = <T extends string>(set: Set<T>, k: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    next.has(k) ? next.delete(k) : next.add(k);
    setter(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-amber-500" aria-hidden />
          {t("businessProfile.title")}
        </CardTitle>
        <CardDescription>{t("businessProfile.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="primaryBusinessType">{t("businessProfile.primaryLabel")}</Label>
          <Select
            value={primary || "__none__"}
            onValueChange={(v) =>
              setPrimary(v === "__none__" ? "" : (v as PrimaryBusinessType))
            }
            disabled={!canEdit}
          >
            <SelectTrigger id="primaryBusinessType" className="min-h-11">
              <SelectValue placeholder={t("businessProfile.primaryPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("businessProfile.none")}</SelectItem>
              {PRIMARY_BUSINESS_TYPES.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`businessProfile.primaryTypes.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="preferredScale">{t("businessProfile.preferredScaleLabel")}</Label>
          <Select
            value={scale || "__none__"}
            onValueChange={(v) =>
              setScale(v === "__none__" ? "" : (v as PreferredProjectScaleKey))
            }
            disabled={!canEdit}
          >
            <SelectTrigger id="preferredScale" className="min-h-11">
              <SelectValue placeholder={t("businessProfile.scalePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("businessProfile.none")}</SelectItem>
              {PREFERRED_PROJECT_SCALES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`projectScales.${s}`, { ns: "crm" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 grid gap-2">
          <Label>{t("businessProfile.secondaryLabel")}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("businessProfile.secondaryLabel")}>
            {secondaryOptions.map((k) => {
              const active = secondary.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggle(secondary, k, setSecondary)}
                  aria-pressed={active}
                  className={cn(
                    "min-h-11 rounded-md border px-3 text-sm transition",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-foreground-muted hover:bg-muted",
                  )}
                >
                  {active ? <Check className="mr-1 inline size-3.5" aria-hidden /> : null}
                  {t(`businessProfile.primaryTypes.${k}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sm:col-span-2 grid gap-2">
          <Label>{t("businessProfile.specialtiesLabel")}</Label>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("businessProfile.specialtiesLabel")}>
            {PROJECT_CATEGORY_KEYS.map((c) => {
              const active = specialties.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={active}
                  onClick={() => toggle(specialties, c, setSpecialties)}
                  className={cn(
                    "min-h-9 rounded-md border px-3 text-sm transition",
                    "focus:outline-none focus:ring-2 focus:ring-ring",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground-muted hover:bg-muted",
                  )}
                >
                  {active ? <Check className="mr-1 inline size-3" aria-hidden /> : null}
                  {t(`projectCategories.${c}`, { ns: "crm" })}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-foreground-muted">{t("businessProfile.specialtiesHelper")}</p>
        </div>

        {err ? (
          <div className="sm:col-span-2" role="alert" aria-live="polite">
            <InlineError message={err} />
          </div>
        ) : null}

        <div className="sm:col-span-2 flex justify-end">
          <Button
            type="button"
            className="min-h-11"
            disabled={!canEdit || mutation.isPending}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("businessProfile.saving") : t("businessProfile.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
