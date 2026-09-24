/**
 * Cost Book server helpers.
 *
 * Maps between the database shape (snake_case columns / SQL trace JSON) and the
 * Cost Book domain contracts. No pricing math lives here: the canonical engine
 * and its SQL triggers own every number.
 */

import type {
  CostBookEntry,
  CostBookValues,
  PricingBasisTrace,
} from "@/domains/costBook";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

type Json = Record<string, unknown>;

const asJson = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/** Values block from either a catalog baseline or a company override. */
export function toCostBookValues(raw: unknown): CostBookValues {
  const j = asJson(raw);
  return {
    hoursPerUnit: num(j.hoursPerUnit),
    setupHours: num(j.setupHours),
    minTaskHours: num(j.minTaskHours),
    laborRate: num(j.laborRate),
    materialUnitCost: num(j.materialAllowance ?? j.materialUnitCost),
    wasteFactor: num(j.wasteFactor),
    crewSize: num(j.crewSize),
    equipmentCost: num(j.equipmentCost),
    otherCost: num(j.otherCost),
    directUnitCost: num(j.directUnitCost),
  };
}

const hasAnyValue = (values: CostBookValues): boolean =>
  Object.values(values).some((v) => v !== null && v !== undefined);

/** `public.cost_book_entry` JSON -> domain entry. */
export function toCostBookEntry(raw: unknown): CostBookEntry | null {
  const j = asJson(raw);
  if (!j.assemblyKey) return null;
  const company = j.company ? toCostBookValues(j.company) : null;
  const companyJson = asJson(j.company);
  return {
    assemblyKey: String(j.assemblyKey),
    workItem: str(j.workItem),
    tradeKey: str(j.tradeKey),
    categoryKey: str(j.categoryKey),
    unitKey: str(j.unitKey),
    costBasis: str(j.costBasis),
    catalogVersion: num(j.catalogVersion),
    sourceVersion: str(j.sourceVersion),
    productivityConvention: str(asJson(j.baseline).productivityConvention),
    baseline: toCostBookValues(j.baseline),
    company: company && hasAnyValue(company) ? company : null,
    companyNote: str(companyJson.rateNote),
    companyUpdatedAt: str(companyJson.updatedAt),
    isCustomized: Boolean(j.isCustomized),
  };
}

/** `public.line_pricing_basis` JSON -> contractor-facing trace. */
export function toPricingBasisTrace(raw: unknown): PricingBasisTrace | null {
  const j = asJson(raw);
  if (!j.lineId) return null;
  const eff = asJson(j.effective);
  const ov = asJson(j.estimateOverride);
  const basis = asJson(j.basisTrace);

  return {
    lineId: String(j.lineId),
    description: str(j.description),
    tradeKey: str(j.tradeKey),
    categoryKey: str(j.categoryKey),
    unitKey: str(j.unitKey),
    quantity: num(j.quantity) ?? 0,
    quantityBasis: str(j.quantityBasis),
    quantityBasisNote: str(j.quantityBasisNote),
    quantityBasisFormula: str(j.quantityBasisFormula),
    quantityIsAssumedDefault: Boolean(j.quantityIsAssumedDefault),
    costBasis: str(j.costBasis),
    resolutionStatus: str(j.resolutionStatus),
    pricingSource: str(j.pricingSource),
    isPriceOverridden: Boolean(j.isPriceOverridden),
    catalogItemKey: str(j.catalogItemKey),
    catalogEntry: toCostBookEntry(j.catalogEntry),
    effective: {
      hoursPerUnit: num(eff.hoursPerUnit),
      setupHours: num(eff.setupHours),
      laborHoursRaw: num(eff.laborHoursRaw),
      laborHours: num(eff.laborHours),
      laborRate: num(eff.laborRate),
      laborFormula: str(eff.laborFormula),
      materialUnitCost: num(eff.materialUnitCost),
      equipmentCost: num(eff.equipmentCost),
      subcontractorCost: num(eff.subcontractorCost),
      otherCost: num(eff.otherCost),
      laborTotal: num(eff.laborTotal),
      materialTotal: num(eff.materialTotal),
      directCost: num(eff.directCost),
    },
    estimateOverride: {
      hoursPerUnit: num(ov.hoursPerUnit),
      setupHours: num(ov.setupHours),
      laborRate: num(ov.laborRate),
      materialUnitCost: num(ov.materialUnitCost),
      equipmentCost: num(ov.equipmentCost),
      otherCost: num(ov.otherCost),
      note: str(ov.note),
      at: str(ov.at),
    },
    sources: asJson(basis.sources) as PricingBasisTrace["sources"],
  };
}

/** Domain values -> `org_assembly_overrides` columns (company Cost Book). */
export function toCompanyOverrideRow(values: CostBookValues): Record<string, unknown> {
  return {
    default_labor_hours: values.hoursPerUnit ?? null,
    setup_hours: values.setupHours ?? null,
    min_task_hours: values.minTaskHours ?? null,
    material_allowance: values.materialUnitCost ?? null,
    waste_factor: values.wasteFactor ?? null,
    crew_size: values.crewSize ?? null,
    equipment_cost: values.equipmentCost ?? null,
    other_cost: values.otherCost ?? null,
    direct_unit_cost: values.directUnitCost ?? null,
  };
}

/** Domain values -> `estimate_line_items` per-estimate override columns. */
export function toLineOverrideRow(values: CostBookValues): Record<string, unknown> {
  return {
    rate_override_hours_per_unit: values.hoursPerUnit ?? null,
    rate_override_setup_hours: values.setupHours ?? null,
    rate_override_labor_rate: values.laborRate ?? null,
    rate_override_material_unit_cost: values.materialUnitCost ?? null,
    rate_override_equipment_cost: values.equipmentCost ?? null,
    rate_override_other_cost: values.otherCost ?? null,
  };
}

/** Company Cost Book rows for the settings list. */
export interface CostBookListRow {
  assemblyKey: string;
  workItem: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  unitKey: string | null;
  costBasis: string | null;
  baseline: CostBookValues;
  company: CostBookValues | null;
  isCustomized: boolean;
  companyUpdatedAt: string | null;
}
