/**
 * Apply live material pricing to an estimate's system-priced lines.
 *
 * Runs immediately AFTER the catalog pricing bridge, so the catalog value is
 * already on the line and is what remains when a live lookup does not produce
 * a price.
 *
 * Deliberately inert without a configured provider: it returns early and
 * writes nothing at all. Estimates priced today (no key exists yet) are
 * therefore untouched — no rows, no provenance, no timestamps.
 *
 * Contractor intent is never overwritten: manually overridden and
 * contractor-priced lines are skipped.
 */

import type {
  MaterialPriceProvenance,
  MaterialPricingProviderType,
} from "@/domains/materialPricing/types";

type SB = { from: (t: string) => any };

export interface LiveMaterialPricingReport {
  providerType: MaterialPricingProviderType | null;
  linesConsidered: number;
  livePriced: number;
  catalogRetained: number;
}

const EMPTY: LiveMaterialPricingReport = {
  providerType: null,
  linesConsidered: 0,
  livePriced: 0,
  catalogRetained: 0,
};

/** Max lines priced live in one pass — a guard against a huge estimate. */
const MAX_LINES = 200;

export async function applyLiveMaterialPricing(
  sb: SB,
  organizationId: string,
  estimateId: string,
  projectPostalCode?: string | null,
): Promise<LiveMaterialPricingReport> {
  try {
    const { resolveOrgProvider, resolveMaterialUnitCost } = await import(
      "./materialPricing.server"
    );
    const { provider } = await resolveOrgProvider(organizationId);
    if (!provider) return EMPTY;

    const { data } = await sb
      .from("estimate_line_items")
      .select(
        "id, description, category_key, trade_key, unit_key, material_cost, catalog_item_key, pricing_source, is_price_overridden, pricing_provenance",
      )
      .eq("organization_id", organizationId)
      .eq("estimate_id", estimateId)
      .is("archived_at", null)
      .limit(MAX_LINES);

    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const report: LiveMaterialPricingReport = {
      providerType: provider.providerType,
      linesConsidered: 0,
      livePriced: 0,
      catalogRetained: 0,
    };

    for (const row of rows) {
      if (row.is_price_overridden === true) continue;
      if (row.pricing_source === "contractor") continue;
      report.linesConsidered += 1;

      const catalogUnitCost = Number(row.material_cost ?? 0);
      const resolved = await resolveMaterialUnitCost({
        provider,
        query: {
          organizationId,
          description: String(row.description ?? ""),
          categoryKey: (row.category_key as string | null) ?? null,
          tradeKey: (row.trade_key as string | null) ?? null,
          unitKey: (row.unit_key as string | null) ?? null,
          sku: (row.catalog_item_key as string | null) ?? null,
          postalCode: projectPostalCode ?? null,
        },
        catalogUnitCost,
      });

      if (resolved.provenance.source !== "live_api") {
        report.catalogRetained += 1;
        continue;
      }

      const provenance = {
        ...((row.pricing_provenance as Record<string, unknown> | null) ?? {}),
        materialPrice: resolved.provenance satisfies MaterialPriceProvenance,
      };
      const { error } = await sb
        .from("estimate_line_items")
        .update({ material_cost: resolved.unitCost, pricing_provenance: provenance })
        .eq("organization_id", organizationId)
        .eq("id", row.id as string);
      if (error) report.catalogRetained += 1;
      else report.livePriced += 1;
    }

    return report;
  } catch {
    /* Live pricing is best-effort enrichment: never block estimate pricing. */
    return EMPTY;
  }
}
