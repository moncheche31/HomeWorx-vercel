/**
 * Contractor-internal MATERIAL COST LAYER — contracts.
 *
 * Materials are derived from the CURRENT estimate's priced lines only: the
 * assembly each line resolved to, its trade, its quantity and the material
 * money the engine already calculated. Nothing here reads prior projects,
 * global questions or job templates, so a paint job can never inherit a
 * roofing or cabinet material list.
 */

export type MaterialTier = "major" | "consumable";

/** Where a material number came from. Never "guessed". */
export type MaterialSource =
  | "assembly" /* share of the assembly's priced material allowance */
  | "derived" /* quantity computed from a standard coverage rate */
  | "allowance" /* disclosed allowance, extent not knowable yet */
  | "override" /* contractor-entered price, protected from repricing */
  | "pricing_needed"; /* no reliable material price — contractor input required */

export type MaterialConfidence = "high" | "medium" | "low";

/** Why a line legitimately carries no material money. */
export type NoMaterialReason = "labor_only" | "owner_supplied" | "excluded" | "pricing_needed";

/** One material component of one estimate line. */
export interface MaterialLineComponent {
  /** Stable component key, i18n label lives in `materials.components.<key>`. */
  key: string;
  tier: MaterialTier;
  /** Quantity in the component's own unit, when genuinely derivable. */
  quantity: number | null;
  unitKey: string | null;
  /** Unit cost, only when a quantity exists. */
  unitCost: number | null;
  extendedCost: number;
  source: MaterialSource;
  confidence: MaterialConfidence;
}

export type LineMaterialStatus = "priced" | "override" | "no_material" | "pricing_needed";

/** Materials for one estimate line. */
export interface LineMaterials {
  lineId: string;
  description: string;
  tradeKey: string;
  quantity: number;
  unitKey: string | null;
  /** Per-unit material allowance carried by the line (waste included). */
  perUnitCost: number;
  materialTotal: number;
  status: LineMaterialStatus;
  reason: NoMaterialReason | null;
  components: MaterialLineComponent[];
}

export interface MaterialsBreakdown {
  lines: LineMaterials[];
  majorTotal: number;
  consumableTotal: number;
  materialTotal: number;
  pricingNeededCount: number;
  noMaterialCount: number;
  /** Rolled-up major components across the estimate, biggest first. */
  majorComponents: MaterialLineComponent[];
  consumableComponents: MaterialLineComponent[];
}

/** Minimal line shape the layer needs. Any producer can satisfy it. */
export interface MaterialSourceLine {
  id: string;
  description: string;
  tradeKey?: string | null;
  catalogItemKey?: string | null;
  quantity: number;
  unitKey?: string | null;
  /** Per-unit material cost stored on the line. */
  materialCost: number;
  /** Engine-calculated extended material money, when available. */
  materialTotal?: number | null;
  isPriceOverridden?: boolean | null;
  pricingSource?: string | null;
}
