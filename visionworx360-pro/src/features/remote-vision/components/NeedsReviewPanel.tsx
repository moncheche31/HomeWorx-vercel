import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EstimateScenario } from "@/domains/remoteVision";

interface Props {
  scenarios: EstimateScenario[];
}

/**
 * Recognized work that could NOT be priced (no confirmed quantity, no catalog
 * match, ...) must be impossible to miss. It used to appear only inside each
 * scenario card, which read as "the item disappeared from the estimate".
 *
 * Presentation only: the underlying items come from the same scenario data.
 */
export function NeedsReviewPanel({ scenarios }: Props) {
  const { t } = useTranslation("remote-vision");

  /* The same feature is unpriced across every level; de-duplicate by key. */
  const byKey = new Map<string, { featureKey: string; label: string; reason: string }>();
  for (const scenario of scenarios) {
    for (const feature of scenario.unpricedFeatures ?? []) {
      if (!byKey.has(feature.featureKey)) {
        byKey.set(feature.featureKey, {
          featureKey: feature.featureKey,
          label: feature.label,
          reason: feature.reason,
        });
      }
    }
  }
  const items = [...byKey.values()];

  /*
   * Allowance-priced work IS in the range — the message must say "confirm the
   * size for the detailed estimate", not "add a measurement before it shows".
   */
  const allowanceByKey = new Map<
    string,
    { featureKey: string; label: string; quantity: number; unitKey: string; basisKey: string }
  >();
  for (const scenario of scenarios) {
    for (const feature of scenario.allowanceFeatures ?? []) {
      if (!allowanceByKey.has(feature.featureKey)) {
        allowanceByKey.set(feature.featureKey, {
          featureKey: feature.featureKey,
          label: feature.label,
          quantity: feature.quantity,
          unitKey: feature.unitKey,
          basisKey: feature.basisKey ?? "standard",
        });
      }
    }
  }
  const allowances = [...allowanceByKey.values()];

  if (items.length === 0 && allowances.length === 0) return null;

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          {allowances.length > 0 && items.length === 0
            ? t("levels.allowanceTitle", { count: allowances.length })
            : t("levels.unpricedTitle", { count: items.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {allowances.length > 0 ? (
          <div className="space-y-2">
            {items.length > 0 ? (
              <p className="text-sm font-semibold">
                {t("levels.allowanceTitle", { count: allowances.length })}
              </p>
            ) : null}
            <ul className="space-y-1 text-sm">
              {allowances.map((item) => (
                <li key={item.featureKey}>
                  <span className="font-medium">{item.label}</span>
                  {" — "}
                  <span className="text-foreground-muted">
                    {t("levels.allowanceReason")}
                    {" ("}
                    {/* State the actual assumed size and the rule of thumb behind it. */}
                    {t("levels.allowanceDetail", {
                      quantity: item.quantity,
                      unit: t(`units.${item.unitKey}`, { defaultValue: item.unitKey }),
                      basis: t(`levels.allowanceBasis.${item.basisKey}`, {
                        defaultValue: t("levels.allowanceBasis.standard"),
                      }),
                    })}
                    {")"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-foreground-muted">{t("levels.allowanceHint")}</p>
          </div>
        ) : null}
        {items.length > 0 ? (
          <div className="space-y-2">
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.featureKey}>
                  <span className="font-medium">{item.label}</span>
                  {" — "}
                  <span className="text-foreground-muted">
                    {t(`levels.unpricedReason.${item.reason}`, {
                      defaultValue: t("levels.unpricedReason.unknown"),
                    })}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-foreground-muted">{t("levels.unpricedHint")}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

