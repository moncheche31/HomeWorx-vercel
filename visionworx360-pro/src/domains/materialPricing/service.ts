/**
 * Material pricing service — the ONE place a material unit cost is chosen.
 *
 * Resolution order:
 *   1. a configured, enabled live provider that returns a usable price;
 *   2. otherwise the static catalog value already in `catalog_assemblies`.
 *
 * Fallback is silent and total: any failure mode (no provider, disabled,
 * no match, bad number, throw, timeout) yields the catalog value with a
 * recorded reason. Estimate generation can never fail because of this module.
 *
 * Pure orchestration — no Supabase, no React, no i18n.
 */

import type {
  MaterialPriceFallbackReason,
  MaterialPriceProvenance,
  MaterialPricingProvider,
  MaterialPricingQuery,
} from "./types";

/** Hard ceiling on a live lookup. A slow vendor must not slow down pricing. */
export const MATERIAL_LOOKUP_TIMEOUT_MS = 6000;

export interface ResolvedMaterialCost {
  /** The unit cost to use. Always a finite number >= 0. */
  unitCost: number;
  provenance: MaterialPriceProvenance;
}

function catalogResult(
  catalogUnitCost: number,
  fallbackReason: MaterialPriceFallbackReason,
): ResolvedMaterialCost {
  const cost = Number.isFinite(catalogUnitCost) && catalogUnitCost > 0 ? catalogUnitCost : 0;
  return {
    unitCost: cost,
    provenance: { source: "static_catalog", catalogUnitCost: cost, fallbackReason },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function resolveMaterialUnitCost(input: {
  provider: MaterialPricingProvider | null;
  /** False when the org has a key stored but switched the provider off. */
  providerEnabled?: boolean;
  query: MaterialPricingQuery;
  /** Today's hand-maintained catalog value. Always the fallback. */
  catalogUnitCost: number;
  timeoutMs?: number;
}): Promise<ResolvedMaterialCost> {
  const { provider, query, catalogUnitCost } = input;
  if (!provider) return catalogResult(catalogUnitCost, "no-provider-configured");
  if (input.providerEnabled === false) return catalogResult(catalogUnitCost, "provider-disabled");

  let quote: Awaited<ReturnType<MaterialPricingProvider["lookupUnitPrice"]>> = null;
  try {
    quote = await withTimeout(
      provider.lookupUnitPrice(query),
      input.timeoutMs ?? MATERIAL_LOOKUP_TIMEOUT_MS,
    );
  } catch (err) {
    const timedOut = err instanceof Error && err.message === "timeout";
    return catalogResult(catalogUnitCost, timedOut ? "timeout" : "lookup-failed");
  }

  if (!quote) return catalogResult(catalogUnitCost, "no-match");
  if (!Number.isFinite(quote.unitPrice) || quote.unitPrice <= 0) {
    return catalogResult(catalogUnitCost, "invalid-price");
  }

  return {
    unitCost: Math.round(quote.unitPrice * 100) / 100,
    provenance: {
      source: "live_api",
      providerType: quote.providerType,
      unitPrice: Math.round(quote.unitPrice * 100) / 100,
      currency: quote.currency,
      sourceRef: quote.sourceRef ?? null,
      productName: quote.productName ?? null,
      retrievedAt: quote.retrievedAt,
      fallbackReason: null,
      catalogUnitCost:
        Number.isFinite(catalogUnitCost) && catalogUnitCost > 0 ? catalogUnitCost : 0,
    },
  };
}

/**
 * Which source priced a stored line. Absence of material-price provenance means
 * the line was priced the way every line was priced before live pricing
 * existed: from the static catalog.
 */
export function materialPriceSourceOf(
  provenance: unknown,
): MaterialPriceProvenance["source"] {
  const material = (provenance as { materialPrice?: { source?: string } } | null)?.materialPrice;
  return material?.source === "live_api" ? "live_api" : "static_catalog";
}
