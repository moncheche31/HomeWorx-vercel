import { useTranslation } from "react-i18next";
import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DangerNotice, WarningNotice } from "@/components/feedback/Notice";
import type { GroundedScope, GroundedScopeItem, SanityReport } from "@/domains/scopeGrounding";

interface Props {
  grounded: GroundedScope | null;
  sanity: SanityReport | null;
  removedFeatureKeys: readonly string[];
  onRemove: (featureKey: string) => void;
  onRestore: (featureKey: string) => void;
}

/**
 * Exact geometry first, always. The rounded-up ballpark pricing quantity is
 * shown next to it — never instead of it — so 7.83 LF is never displayed as an
 * 8 ft wall.
 */
function formatQuantity(item: GroundedScopeItem): string | null {
  if (item.quantity == null) return null;
  const qty = Math.round(item.quantity * 100) / 100;
  const unit = item.unitKey ? ` ${item.unitKey.replace(/_/g, " ")}` : "";
  const priced =
    item.pricingQuantity != null && item.pricingQuantity !== qty
      ? ` (priced at ${item.pricingQuantity}${unit})`
      : "";
  return `${qty}${unit}${priced}`;
}


/**
 * "Scope interpreted from your input" (ADR-057).
 *
 * The contractor sees exactly what will be priced, what was assumed, and what
 * was seen but deliberately NOT priced — with the provenance of every number.
 */
export function GroundedScopePanel({
  grounded,
  sanity,
  removedFeatureKeys,
  onRemove,
  onRestore,
}: Props) {
  const { t } = useTranslation("remote-vision");

  const renderItem = (item: GroundedScopeItem, requiredLabel?: string) => {
    const qty = formatQuantity(item);
    return (
      <li key={item.id} className="rounded-md border border-border-subtle p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">{item.label}</p>
            {qty ? <p className="text-sm text-foreground-muted">{qty}</p> : null}
            {requiredLabel ? (
              <p className="text-xs text-foreground-muted">{requiredLabel}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {item.provenance.isDefault ? (
              <Badge variant="outline">{t("interpreted.sources.assembly_default")}</Badge>
            ) : (
              <Badge variant="secondary">
                {t(`interpreted.sources.${item.provenance.source}`)}
              </Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRemove(item.featureKey)}
            >
              {t("interpreted.remove")}
            </Button>
          </div>
        </div>
        <Accordion type="single" collapsible>
          <AccordionItem value="why" className="border-none">
            <AccordionTrigger className="py-2 text-xs">{t("interpreted.why")}</AccordionTrigger>
            <AccordionContent className="space-y-1 text-xs text-foreground-muted">
              <p>{item.provenance.rationale}</p>
              {item.provenance.evidence ? <p>“{item.provenance.evidence}”</p> : null}
              <p>{item.reason}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </li>
    );
  };

  const nothing =
    !grounded ||
    (grounded.explicit.length === 0 &&
      grounded.incidental.length === 0 &&
      grounded.observations.length === 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("interpreted.title")}</CardTitle>
        <p className="text-sm text-foreground-muted">{t("interpreted.hint")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {sanity && sanity.findings.length > 0 ? (
          <div className="space-y-2">
            {sanity.blocked ? (
              <DangerNotice
                title={t("interpreted.sanity")}
                description={t("interpreted.blocked")}
              />
            ) : null}
            {sanity.findings.map((f) =>
              f.severity === "blocker" ? (
                <DangerNotice key={f.id} title={f.message} />
              ) : (
                <WarningNotice key={f.id} title={f.message} />
              ),
            )}
          </div>
        ) : null}

        {nothing ? <p className="text-sm text-foreground-muted">{t("interpreted.empty")}</p> : null}

        {grounded && grounded.explicit.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("interpreted.included")}</h3>
            <ul className="space-y-2">{grounded.explicit.map((i) => renderItem(i))}</ul>
          </section>
        ) : null}

        {grounded && grounded.incidental.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("interpreted.incidental")}</h3>
            <ul className="space-y-2">
              {grounded.incidental.map((i) =>
                renderItem(
                  i,
                  i.requiredBy
                    ? t("interpreted.requiredBy", {
                        item:
                          grounded.explicit.find((e) => e.id === i.requiredBy)?.label ??
                          i.requiredBy,
                      })
                    : undefined,
                ),
              )}
            </ul>
          </section>
        ) : null}

        {grounded && grounded.observations.length > 0 ? (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Info className="size-4" aria-hidden />
              {t("interpreted.observations")}
            </h3>
            <ul className="space-y-2">
              {grounded.observations.map((o) => (
                <li key={o.id} className="rounded-md border border-border-subtle p-3 text-sm">
                  <p className="font-medium">{o.label}</p>
                  <p className="text-xs text-foreground-muted">{o.reason}</p>
                  {o.question ? <p className="mt-1 text-xs">{o.question}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {grounded && grounded.clarifications.length > 0 ? (
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4" aria-hidden />
              {t("interpreted.clarifications")}
            </h3>
            <ul className="space-y-1 text-sm text-foreground-muted">
              {grounded.clarifications.map((c) => (
                <li key={c.id}>{c.message}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {grounded && grounded.dimensions.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("interpreted.dimensions")}</h3>
            <ul className="flex flex-wrap gap-2">
              {grounded.dimensions.map((d) => (
                <li key={d.id}>
                  <Badge variant="outline">
                    {d.subject}: {d.display}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {grounded && grounded.exclusions.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("interpreted.exclusions")}</h3>
            <ul className="flex flex-wrap gap-2">
              {grounded.exclusions.map((e) => (
                <li key={e.id}>
                  <Badge variant="secondary">{e.label}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {removedFeatureKeys.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">
              {t("interpreted.removed", { count: removedFeatureKeys.length })}
            </h3>
            <ul className="flex flex-wrap gap-2">
              {removedFeatureKeys.map((key) => (
                <li key={key}>
                  <Button type="button" size="sm" variant="outline" onClick={() => onRestore(key)}>
                    {key} · {t("interpreted.restore")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
