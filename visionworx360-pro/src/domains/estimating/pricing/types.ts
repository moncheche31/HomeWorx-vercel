/**
 * Regional pricing abstraction (Module 008).
 *
 * Pricing is NEVER hardcoded in the engine. A provider resolves rates for a
 * location, from most specific to least specific: ZIP → county → state →
 * region → national. Version 1 ships a seeded provider only; RSMeans,
 * Craftsman, the VisionWorx Pricing Database and supplier pricing APIs plug in
 * behind the same interface with zero engine changes.
 */

export type PricingScope = "postal_code" | "county" | "state" | "region" | "national";

export interface PricingLocation {
  postalCode?: string | null;
  county?: string | null;
  state?: string | null;
  region?: string | null;
  countryCode?: string | null;
}

export interface PricingQuery {
  organizationId: string;
  location: PricingLocation;
  tradeKey?: string | null;
  assemblyKey?: string | null;
  categoryKey?: string | null;
  unitKey?: string | null;
  asOf?: string | null;
}

export interface PricingProvenance {
  providerId: string;
  scope: PricingScope;
  datasetVersion?: string | null;
  effectiveDate?: string | null;
  isSampleData: boolean;
  attribution?: string | null;
}

export interface RegionalPricing {
  currency: string;
  /** Multiplier vs. national baseline (1 = baseline). */
  regionalFactor: number;
  /** Burdened hourly labor rate for the trade, when known. */
  laborRate?: number | null;
  /** Material cost multiplier for the location. */
  materialFactor?: number | null;
  /** Equipment cost multiplier for the location. */
  equipmentFactor?: number | null;
  /** Sales tax percentage for the location, when known. */
  taxRatePct?: number | null;
  provenance: PricingProvenance;
}

export interface PricingProvider {
  readonly id: string;
  readonly requiresLicense: boolean;
  resolve(query: PricingQuery): Promise<RegionalPricing | null>;
}
