import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { EstimateDTO } from "../types";
import { useEstimateCopyMutations } from "../hooks/useEstimateCopy";

/**
 * Provenance + the explicit pricing choice after a copy.
 *
 * Copied prices are contractor-authoritative: nothing reprices them on load or
 * reopen. "Refresh current pricing" is the only path, and it re-prices only
 * lines still holding an untouched copied price.
 */
export function CopiedPricingBanner({
  estimate,
  readOnly,
}: {
  estimate: EstimateDTO;
  readOnly: boolean;
}) {
  const { t } = useTranslation("estimating");
  const { refreshCopiedPricing } = useEstimateCopyMutations(estimate.projectId, estimate.id);
  if (!estimate.copiedFromEstimateId) return null;

  const refreshed = estimate.pricingCopyMode === "refreshed";

  return (
    <Card className="proposal-no-print border-dashed">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Copy className="size-4" aria-hidden />
            {t("copy.banner.title", { source: estimate.copiedFromLabel ?? "" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {refreshed ? t("copy.banner.refreshed") : t("copy.banner.kept")}
          </p>
        </div>
        {!readOnly && !refreshed && (
          <Button
            type="button"
            variant="outline"
            className="min-h-(--control-min-h) w-full sm:w-auto"
            disabled={refreshCopiedPricing.isPending}
            onClick={async () => {
              try {
                await refreshCopiedPricing.mutateAsync({ estimateId: estimate.id });
                toast.success(t("copy.toast.refreshed"));
              } catch {
                toast.error(t("copy.toast.failed"));
              }
            }}
          >
            <RefreshCw className="mr-2 size-4" aria-hidden />
            {t("copy.banner.refresh")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
