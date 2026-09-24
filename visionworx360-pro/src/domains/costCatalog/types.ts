/**
 * Cost Catalog item shape — CONTRACT ONLY, prepared for Module 007B.
 *
 * The catalog defines WORK (items and assemblies). It does not define money on
 * its own: monetary benchmarks come from LocalizedCostProvider, and product
 * money comes from SupplierCatalogProvider. The estimate engine calculates.
 *
 * SEEDING RULE: only structurally valid records explicitly flagged
 * `isSampleData: true`, or licensed/approved production data. Never seed
 * invented pricing as authoritative.
 */

export interface CatalogMaterialComponent {
  name: string;
  unitKey: string;
  quantityPerUnit: number;
  /** Typical cost is a benchmark hint only; real cost resolves via providers. */
  typicalUnitCost?: number | null;
}

export interface CatalogItem {
  /** Stable, human-readable key, e.g. "bath.tile.floor.install". */
  catalogItemKey: string;
  /** Null for system/global items; set for organization-authored items. */
  organizationId?: string | null;
  categoryKey: string;
  subcategoryKey?: string | null;
  tradeKey?: string | null;
  /** Internal standard scope wording. */
  standardScopeDescription: string;
  /** Client-facing wording used in proposals. */
  clientDescription?: string | null;
  unitKey: string;
  /** Units per crew hour. */
  productionRate?: number | null;
  laborHoursPerUnit?: number | null;
  crewTypeKey?: string | null;
  laborAssumptions?: string | null;
  materialComponents?: CatalogMaterialComponent[];
  equipmentAssumptions?: string | null;
  subcontractorAssumptions?: string | null;
  /** 0.05 = 5% waste. */
  wasteFactor?: number | null;
  defaultOverheadPct?: number | null;
  defaultProfitPct?: number | null;
  defaultContingencyPct?: number | null;
  isTaxable?: boolean;
  exclusions?: string[];
  assumptions?: string[];
  /** Key used against the localized cost provider. */
  regionalCostLookupKey?: string | null;
  /** Product categories typically selected for this work. */
  relatedProductCategoryKeys?: string[];
  relatedScopeTemplateKeys?: string[];
  isActive: boolean;
  /** MUST be true for any non-licensed example content. */
  isSampleData: boolean;
  sourceVersion?: string | null;
}

export interface CatalogAssembly {
  assemblyKey: string;
  organizationId?: string | null;
  name: string;
  categoryKey: string;
  components: { catalogItemKey: string; quantityPerUnit: number }[];
  unitKey: string;
  isSampleData: boolean;
}

/**
 * Planned Module 007B coverage (residential remodeling): kitchens, bathrooms,
 * basements, additions, painting, drywall, framing, insulation, flooring,
 * roofing, siding, decks, outdoor living, windows, doors, trim, plumbing,
 * electrical, HVAC, handyman, accessibility, restoration, demolition, cleanup.
 */
export const PLANNED_CATALOG_CATEGORY_KEYS = [
  "remodeling",
  "kitchens",
  "bathrooms",
  "basements",
  "additions",
  "painting",
  "drywall",
  "framing",
  "insulation",
  "flooring",
  "roofing",
  "siding",
  "decks",
  "outdoor-living",
  "windows",
  "doors",
  "trim",
  "plumbing",
  "electrical",
  "hvac",
  "handyman",
  "accessibility",
  "restoration",
  "demolition",
  "cleanup",
] as const;

export type PlannedCatalogCategoryKey = (typeof PLANNED_CATALOG_CATEGORY_KEYS)[number];
