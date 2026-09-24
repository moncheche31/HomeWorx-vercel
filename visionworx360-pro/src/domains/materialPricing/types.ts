/**
 * Live material pricing — PLUGGABLE PROVIDER CONTRACT.
 *
 * Material money in this system has always come from the static catalog
 * (`catalog_assemblies.material_allowance`, hand-maintained by the
 * contractor). This domain adds an OPTIONAL live source in front of it.
 *
 * NON-NEGOTIABLE RULES
 * - The catalog stays the floor. A live lookup that is not configured, times
 *   out, errors, or returns nothing NEVER blocks or breaks pricing: the static
 *   catalog value is used, silently.
 * - No vendor is hardcoded. Providers register by `MaterialPricingProviderType`
 *   so a second source (e.g. an official Lowe's API) is a registration, not a
 *   redesign.
 * - Credentials never leave the server. A provider instance is only ever
 *   constructed inside a server handler from an org-scoped stored key.
 * - Live prices are estimates, never guaranteed, and every line records which
 *   source priced it (`live_api` vs `static_catalog`) for audit.
 */

/** Mirrors the `material_pricing_provider_type` Postgres enum. */
export type MaterialPricingProviderType = "bigbox_home_depot";

export const MATERIAL_PRICING_PROVIDER_TYPES: readonly MaterialPricingProviderType[] = [
  "bigbox_home_depot",
];

/** Which source produced the material cost actually used on a line. */
export type MaterialPriceSource = "live_api" | "static_catalog";

/** Why a live lookup did not supply the price. Recorded, never surfaced as an error. */
export type MaterialPriceFallbackReason =
  | "no-provider-configured"
  | "provider-disabled"
  | "no-match"
  | "invalid-price"
  | "lookup-failed"
  | "timeout"
  | null;

export interface MaterialPricingQuery {
  organizationId: string;
  /** Free-text material/work description, e.g. "standing seam metal roofing". */
  description: string;
  categoryKey?: string | null;
  tradeKey?: string | null;
  /** Unit the estimate line prices in, e.g. `square_foot`. */
  unitKey?: string | null;
  /** Vendor SKU / model number when the catalog knows one. */
  sku?: string | null;
  postalCode?: string | null;
}

export interface MaterialPriceQuote {
  /** Price per estimate unit, in `currency`. Waste is applied downstream. */
  unitPrice: number;
  currency: string;
  providerType: MaterialPricingProviderType;
  providerLabel: string;
  /** Product id / SKU / URL the price came from, for audit. */
  sourceRef?: string | null;
  productName?: string | null;
  retrievedAt: string;
  /** Live pricing is never a guaranteed price. */
  isEstimateOnly: true;
}

export interface ProviderVerifyResult {
  ok: boolean;
  message?: string | null;
}

/** One vendor adapter. Constructed server-side only, with a stored API key. */
export interface MaterialPricingProvider {
  readonly providerType: MaterialPricingProviderType;
  readonly displayName: string;
  /** Cheap "does this key work" ping used by the settings UI. */
  verifyCredentials(): Promise<ProviderVerifyResult>;
  /** Null means "no usable price" — the caller falls back to the catalog. */
  lookupUnitPrice(query: MaterialPricingQuery): Promise<MaterialPriceQuote | null>;
}

export interface MaterialPricingProviderConfig {
  providerType: MaterialPricingProviderType;
  apiKey: string;
}

export type MaterialPricingProviderFactory = (
  config: MaterialPricingProviderConfig,
) => MaterialPricingProvider;

/** Provider row as safe to expose to the client — never includes the key. */
export interface MaterialPricingProviderStatus {
  providerType: MaterialPricingProviderType;
  displayName: string;
  isConfigured: boolean;
  isEnabled: boolean;
  lastVerifiedAt: string | null;
  lastVerifyStatus: string | null;
  lastVerifyError: string | null;
}

/** Provenance stamped on an estimate line whose material cost was resolved. */
export interface MaterialPriceProvenance {
  source: MaterialPriceSource;
  providerType?: MaterialPricingProviderType | null;
  unitPrice?: number | null;
  currency?: string | null;
  sourceRef?: string | null;
  productName?: string | null;
  retrievedAt?: string | null;
  fallbackReason?: MaterialPriceFallbackReason;
  /** The static catalog value, always retained even when live pricing wins. */
  catalogUnitCost?: number | null;
}
