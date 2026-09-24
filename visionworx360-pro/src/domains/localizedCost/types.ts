/**
 * Localized construction cost data — CONTRACT ONLY (Module 007A).
 *
 * These interfaces exist so the estimate engine can consume regional benchmark
 * costs (labor rates, production rates, equipment, installed unit costs)
 * without ever depending on a specific vendor.
 *
 * HARD RULES
 * - No proprietary cost data (RSMeans or otherwise) may be copied, seeded, or
 *   cached beyond what the license explicitly allows.
 * - Implementations run server-side only. Vendor credentials never reach the
 *   browser bundle.
 * - Every returned value carries its source, source version and effective date
 *   so an estimate can record provenance.
 */

/** Where the work happens. Any subset may be supplied; providers degrade gracefully. */
export interface CostLocation {
  postalCode?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  countryCode?: string | null;
  /** Vendor-specific location identifier (e.g. a cost-data city index key). */
  costLocationId?: string | null;
}

/** Provenance attached to every externally sourced value. */
export interface CostDataProvenance {
  /** Provider id, e.g. "rsmeans", "org-custom", "sample". */
  source: string;
  /** Vendor dataset/release version, when known. */
  sourceVersion?: string | null;
  /** Date the figures are effective as of (ISO 8601). */
  effectiveDate?: string | null;
  /** Timestamp the value was retrieved (ISO 8601). */
  retrievedAt: string;
  /** Regional multiplier already applied (1 = national baseline). */
  regionalAdjustmentFactor?: number | null;
  /** Attribution text the vendor requires to be displayed, if any. */
  attribution?: string | null;
  /** True when the record is illustrative sample data, not licensed data. */
  isSampleData?: boolean;
}

export interface LocalizedCostQuery {
  organizationId: string;
  location: CostLocation;
  /** Stable catalog key when the request originates from a catalog item. */
  catalogItemKey?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  tradeKey?: string | null;
  unitKey?: string | null;
  asOf?: string | null;
}

/** Installed unit cost breakdown for one work item at one location. */
export interface LocalizedUnitCost {
  unitKey: string;
  laborCost?: number | null;
  materialCost?: number | null;
  equipmentCost?: number | null;
  subcontractorAllowance?: number | null;
  demolitionCost?: number | null;
  disposalCost?: number | null;
  /** Total installed cost per unit, when the source publishes one. */
  installedUnitCost?: number | null;
  currency: string;
  provenance: CostDataProvenance;
}

export interface LaborRateQuery {
  organizationId: string;
  location: CostLocation;
  tradeKey?: string | null;
  crewTypeKey?: string | null;
  asOf?: string | null;
}

export interface LaborRate {
  tradeKey?: string | null;
  crewTypeKey?: string | null;
  /** Bare hourly rate. */
  hourlyRate: number;
  /** Burdened rate including taxes/insurance, when published. */
  burdenedHourlyRate?: number | null;
  crewComposition?: { roleKey: string; count: number }[];
  currency: string;
  provenance: CostDataProvenance;
}

export interface ProductionRateQuery {
  organizationId: string;
  location?: CostLocation;
  catalogItemKey?: string | null;
  tradeKey?: string | null;
  unitKey?: string | null;
}

export interface ProductionRate {
  unitKey: string;
  /** Units produced per crew hour. */
  unitsPerCrewHour?: number | null;
  /** Labor hours consumed per unit (inverse of unitsPerCrewHour). */
  laborHoursPerUnit?: number | null;
  crewTypeKey?: string | null;
  provenance: CostDataProvenance;
}

/** Regional multiplier lookup, used when only national baselines are licensed. */
export interface RegionalAdjustment {
  factor: number;
  location: CostLocation;
  provenance: CostDataProvenance;
}

export interface LocalizedCostProvider {
  readonly id: string;
  readonly requiresLicense: boolean;
  getUnitCost(query: LocalizedCostQuery): Promise<LocalizedUnitCost | null>;
  getRegionalAdjustment?(location: CostLocation): Promise<RegionalAdjustment | null>;
}

export interface LaborRateProvider {
  readonly id: string;
  getLaborRate(query: LaborRateQuery): Promise<LaborRate | null>;
}

export interface ProductionRateProvider {
  readonly id: string;
  getProductionRate(query: ProductionRateQuery): Promise<ProductionRate | null>;
}
