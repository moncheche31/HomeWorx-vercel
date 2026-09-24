import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  listPricingLocations,
  setEstimateLocationOverride,
  type PricingLocationOption,
} from "../services/pricingLocation.functions";
import type { EstimateDTO } from "../types";

/**
 * Shows WHICH place the prices were built for.
 *
 * Location factors come from the JOB SITE (property zip prefix -> state
 * average -> national baseline), never from a hardcoded home state. Labor,
 * material and equipment carry separate percentages, so all three are stated;
 * the weighted average is shown as a summary only, never used in math.
 * The contractor can override the location when the job prices elsewhere.
 */
export function LocationFactorNotice({
  estimate,
  className,
}: {
  estimate: Pick<
    EstimateDTO,
    "id" | "pricingLocation" | "pricingLocationSource" | "pricingLocationFactors" | "pricingLocationOverride"
  >;
  className?: string;
}) {
  const { t } = useTranslation("estimating");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const listFn = useServerFn(listPricingLocations);
  const setFn = useServerFn(setEstimateLocationOverride);

  const options = useQuery({
    queryKey: ["estimating", "pricingLocations", search],
    queryFn: () => listFn({ data: { search } }) as Promise<PricingLocationOption[]>,
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: (location: string | null) => setFn({ data: { estimateId: estimate.id, location } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimating"] });
      setOpen(false);
    },
  });

  const location = estimate.pricingLocation;
  if (!location) return null;

  const factors = (estimate.pricingLocationFactors ?? {}) as Record<string, unknown>;
  const pct = (v: unknown) => Number(v ?? 0);
  const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;
  const labor = pct(factors.laborPct);
  const material = pct(factors.materialPct);
  const equipment = pct(factors.equipmentPct);
  /* The book's own weighted average, shown as a single "+N% overall" summary.
     It is reference only: no calculation ever uses it. */
  const total = Math.round(pct(factors.displayTotalPct));
  const source = estimate.pricingLocationSource ?? "national_baseline";

  return (
    <div
      data-testid="estimate-location-factor"
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-foreground-muted",
        className,
      )}
    >
      <MapPin className="size-3.5 shrink-0" aria-hidden />
      <span className="font-medium text-foreground">
        {t("locationFactor.headline", { location })}
      </span>
      <span data-testid="estimate-location-factor-values">
        {t("locationFactor.split", {
          labor: signed(labor),
          material: signed(material),
          equipment: signed(equipment),
        })}
      </span>
      <span data-testid="estimate-location-total-display">
        · {t("locationFactor.total", { total: signed(total) })}
      </span>
      <span>· {t(`locationFactor.source.${source}`, { defaultValue: source })}</span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs">
            {t("locationFactor.change")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("locationFactor.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("locationFactor.dialogBody")}</DialogDescription>
          </DialogHeader>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("locationFactor.searchPlaceholder")}
            aria-label={t("locationFactor.searchPlaceholder")}
          />
          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {(options.data ?? []).map((o) => (
              <button
                key={o.location}
                type="button"
                disabled={apply.isPending}
                onClick={() => apply.mutate(o.location)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-xs last:border-b-0 hover:bg-surface-muted"
              >
                <span className="font-medium text-foreground">{o.location}</span>
                <span className="text-foreground-muted">
                  {t("locationFactor.split", {
                    labor: signed(o.laborPct),
                    material: signed(o.materialPct),
                    equipment: signed(o.equipmentPct),
                  })}
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={apply.isPending || !estimate.pricingLocationOverride}
              onClick={() => apply.mutate(null)}
            >
              {t("locationFactor.useJobSite")}
            </Button>
            {apply.isPending ? (
              <span className="self-center text-xs text-foreground-muted">
                {t("locationFactor.saving")}
              </span>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
