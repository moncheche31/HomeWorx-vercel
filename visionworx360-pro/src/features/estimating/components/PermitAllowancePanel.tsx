import { useTranslation } from "react-i18next";
import { FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/i18n/format";
import { useApplyPermitPlan, usePermitPlanQuery } from "../hooks/usePermits";

interface Props {
  projectId: string;
  estimateId?: string;
  currency: string;
  locale?: "en-US" | "es-US";
  readOnly?: boolean;
}

/**
 * Permit fees are direct costs, never labor. This panel shows what the permit
 * subsystem resolved for THIS project — contractor entry first, then a verified
 * local schedule, then a clearly labeled national 2026 allowance — and lets the
 * contractor push the allowance onto the estimate in one tap.
 */
export function PermitAllowancePanel({
  projectId,
  estimateId,
  currency,
  locale = "en-US",
  readOnly,
}: Props) {
  const { t } = useTranslation("estimating");
  const query = usePermitPlanQuery({ projectId, estimateId });
  const apply = useApplyPermitPlan(projectId, estimateId);
  const result = query.data;

  if (!result || result.plan.components.length === 0) return null;
  const { plan } = result;
  const money = (v: number) => formatCurrency(v, locale, currency);
  const stale = plan.total !== result.currentTotal;

  return (
    <section
      aria-label={t("permits.title")}
      data-testid="estimate-permits"
      className="space-y-3 rounded-md border border-border bg-surface px-3 py-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-foreground">
        <FileCheck2 className="size-4 shrink-0" aria-hidden />
        {t("permits.title")}
      </p>
      <p className="text-foreground-muted">
        {plan.usesNationalFallback ? t("permits.nationalFallback") : t("permits.localResolved")}
      </p>

      <ul className="space-y-2">
        {plan.components.map((c) => (
          <li key={`${c.permitType}-${c.workClass}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium text-foreground">{t(`permits.type.${c.permitType}`)}</span>
            <span className="tabular-nums text-foreground">{money(c.amount)}</span>
            <span className="text-xs text-foreground-muted">
              {t("permits.band", { low: money(c.low), high: money(c.high) })}
            </span>
            <span className="text-xs text-foreground-muted">
              {t("permits.source", { source: c.sourceTitle, version: c.sourceVersion })}
            </span>
            {c.bundledTypes.length > 0 ? (
              <span className="text-xs text-foreground-muted">
                {t("permits.bundles", {
                  types: c.bundledTypes.map((b) => t(`permits.type.${b}`)).join(", "),
                })}
              </span>
            ) : null}
            <span className="text-xs text-foreground-muted">{t("permits.zeroLabor")}</span>
          </li>
        ))}
      </ul>

      <p className="tabular-nums text-foreground">
        {t("permits.total", { total: money(plan.total), low: money(plan.low), high: money(plan.high) })}
      </p>

      {plan.needsJurisdictionConfirmation ? (
        <p className="text-xs text-foreground-muted">{t("permits.verifyLocal")}</p>
      ) : null}
      {result.hasContractorEntry ? (
        <p className="text-xs text-foreground-muted">{t("permits.contractorEntryKept")}</p>
      ) : null}

      {!readOnly && !result.locked && stale ? (
        <Button
          className="h-11 w-full sm:w-auto"
          variant="secondary"
          disabled={apply.isPending}
          onClick={async () => {
            try {
              await apply.mutateAsync();
              toast.success(t("permits.applied"));
            } catch {
              toast.error(t("permits.applyError"));
            }
          }}
        >
          {t("permits.apply", { total: money(plan.total) })}
        </Button>
      ) : null}
    </section>
  );
}
