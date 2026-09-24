import { useTranslation } from "react-i18next";
import { ListChecks, MoreHorizontal, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PricingMode } from "@/domains/estimating/pricingModes";
import { PricingModeSelector } from "./PricingModeSelector";
import type { EstimateDTO, EstimateIntakeMode } from "../types";

/**
 * Estimate type status row for an EXISTING estimate.
 *
 * Once an estimate exists the mode is a fact, not a choice to re-make on the
 * main screen: it renders as plain status text ("Estimate Type: Ballpark").
 * Switching lives in a secondary menu. In ballpark mode the switch item is
 * hosted by BallparkRangeCard's single More options menu so the estimate area
 * never shows two competing menus.
 */
export function EstimateModeCard({
  estimate,
  exceptions,
  readOnly,
  saving,
  onModeChange,
  onPricingModeChange,
  onReviewExceptions,
}: {
  estimate: EstimateDTO;
  projectId: string;
  /** Unresolved detailed lines. Detailed mode only. */
  exceptions: number;
  readOnly: boolean;
  saving: boolean;
  onModeChange: (mode: EstimateIntakeMode) => void;
  /** Sell/presentation switch. Never rebuilds the estimate. */
  onPricingModeChange: (mode: PricingMode) => void;
  onReviewExceptions: () => void;
}) {
  const { t } = useTranslation("estimating");
  const mode = estimate.intakeMode;
  const isBallpark = mode === "ballpark";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted px-3 py-2">
      <div>
        <p className="text-sm text-foreground-muted">
          {t("mode.typeLabel")}:{" "}
          <span className="font-medium text-foreground">{t(`mode.${mode}`)}</span>
        </p>
        <p data-testid="estimate-mode-tagline" className="text-sm text-foreground-muted">
          {t(isBallpark ? "mode.ballparkTagline" : "mode.detailedTagline")}
        </p>
      </div>
      {!readOnly ? (
        <PricingModeSelector
          mode={estimate.pricingMode}
          disabled={saving}
          onChange={onPricingModeChange}
        />
      ) : (
        <p className="text-sm text-foreground-muted">
          {t("pricingMode.label")}:{" "}
          <span className="font-medium text-foreground">
            {t(`pricingMode.${estimate.pricingMode}`)}
          </span>
        </p>
      )}
      {!isBallpark && !readOnly ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-11">
              <MoreHorizontal className="mr-1 size-4" aria-hidden />
              {t("ballparkCard.moreOptions")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem disabled={saving} onSelect={() => onModeChange("ballpark")}>
              <Repeat className="mr-2 size-4" aria-hidden />
              {t("mode.switchToBallpark")}
            </DropdownMenuItem>
            {exceptions > 0 ? (
              <DropdownMenuItem onSelect={onReviewExceptions}>
                <ListChecks className="mr-2 size-4" aria-hidden />
                {t("mode.reviewExceptions", { count: exceptions })}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
