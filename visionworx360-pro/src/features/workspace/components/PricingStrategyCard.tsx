import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Percent } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineError } from "@/components/feedback/InlineError";
import { PricingStrategyFields } from "@/features/estimating/components/PricingStrategyFields";
import {
  isValidTargetGrossMargin,
  normalizePricingStrategy,
  type PricingStrategy,
} from "@/domains/estimating/pricingStrategy";
import { saveOrganization } from "../services/organization.functions";
import type { Organization } from "../types";

/**
 * COMPANY-WIDE default pricing method. Contractor-internal: it decides how new
 * estimates are marked up, and is never shown to clients. Existing estimates
 * keep whatever method they were saved with.
 */
export function PricingStrategyCard({
  organization,
  onSaved,
}: {
  organization: Organization;
  onSaved: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation("estimating");
  const save = useServerFn(saveOrganization);
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<PricingStrategy>(() =>
    normalizePricingStrategy({
      method: organization.defaultPricingMethod,
      targetGrossMarginPct: organization.defaultTargetGrossMarginPct,
      overheadPct: organization.defaultOverheadPct,
      profitPct: organization.defaultProfitPct,
    }),
  );

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          organizationName: organization.organizationName,
          defaultPricingMethod: strategy.method,
          defaultTargetGrossMarginPct: strategy.targetGrossMarginPct,
          defaultOverheadPct: strategy.overheadPct,
          defaultProfitPct: strategy.profitPct,
        },
      }),
    onSuccess: async () => {
      setError(null);
      toast.success(t("pricingStrategy.saved"));
      await onSaved();
    },
    onError: (err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
  });

  const invalid =
    strategy.method === "target_gross_margin" &&
    !isValidTargetGrossMargin(strategy.targetGrossMarginPct);

  return (
    <Card data-testid="company-pricing-strategy">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="size-4 text-primary" aria-hidden />
          {t("pricingStrategy.companyTitle")}
        </CardTitle>
        <CardDescription>
          {t("pricingStrategy.companyDescription")} {t("pricingStrategy.internalOnly")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <PricingStrategyFields
          value={strategy}
          onChange={setStrategy}
          idPrefix="company-pricing"
        />
        {error ? <InlineError message={error} /> : null}
        <div className="flex justify-end">
          <Button
            type="button"
            className="min-h-11"
            disabled={invalid || mutation.isPending}
            aria-busy={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {t("pricingStrategy.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
