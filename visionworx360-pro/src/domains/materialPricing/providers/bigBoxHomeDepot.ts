/**
 * BigBox (Home Depot product data) adapter — WIRING ONLY.
 *
 * No credentials exist yet, so nothing here is ever exercised against the real
 * service: without a stored API key the registry never constructs this
 * provider, and the pricing service falls back to the static catalog.
 *
 * When a key lands, this is the only file that has to be correct for BigBox;
 * the estimating engine keeps talking to `MaterialPricingProvider`.
 */

import type {
  MaterialPriceQuote,
  MaterialPricingProvider,
  MaterialPricingProviderConfig,
  MaterialPricingQuery,
  ProviderVerifyResult,
} from "../types";

export const BIGBOX_DISPLAY_NAME = "BigBox (Home Depot)";
const BIGBOX_ENDPOINT = "https://api.bigboxapi.com/request";
const REQUEST_TIMEOUT_MS = 6000;

async function callBigBox(
  apiKey: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = new URL(BIGBOX_ENDPOINT);
  url.searchParams.set("api_key", apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`BigBox responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

interface BigBoxSearchResponse {
  search_results?: {
    product?: {
      title?: string | null;
      item_id?: string | null;
      link?: string | null;
    } | null;
    offers?: { primary?: { price?: number | null } | null } | null;
    price?: number | null;
  }[];
}

export const bigBoxHomeDepotProviderFactory = (
  config: MaterialPricingProviderConfig,
): MaterialPricingProvider => ({
  providerType: "bigbox_home_depot",
  displayName: BIGBOX_DISPLAY_NAME,

  async verifyCredentials(): Promise<ProviderVerifyResult> {
    try {
      await callBigBox(config.apiKey, {
        type: "search",
        search_term: "caulk",
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Verification failed" };
    }
  },

  async lookupUnitPrice(query: MaterialPricingQuery): Promise<MaterialPriceQuote | null> {
    const term = (query.sku || query.description || "").trim();
    if (!term) return null;

    const payload = (await callBigBox(config.apiKey, {
      type: "search",
      search_term: term,
      ...(query.postalCode ? { customer_zipcode: query.postalCode } : {}),
    })) as BigBoxSearchResponse;

    const first = payload.search_results?.[0];
    const price = first?.offers?.primary?.price ?? first?.price ?? null;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;

    return {
      unitPrice: price,
      currency: "USD",
      providerType: "bigbox_home_depot",
      providerLabel: BIGBOX_DISPLAY_NAME,
      sourceRef: first?.product?.item_id ?? first?.product?.link ?? null,
      productName: first?.product?.title ?? null,
      retrievedAt: new Date().toISOString(),
      isEstimateOnly: true,
    };
  },
});
