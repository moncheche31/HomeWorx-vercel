/**
 * Cost Catalog extension point — CONTRACT ONLY (Module 007A).
 *
 * The catalog itself is intentionally NOT implemented in this module. The
 * estimate engine resolves defaults through this interface so a future
 * centralized catalog (org catalog, national cost data, supplier feeds) can be
 * dropped in without rewriting estimate logic.
 *
 * Rules for future implementers:
 * - Catalog lookups only ever supply DEFAULTS for a new/blank line.
 * - A value a user has edited is never overwritten by the catalog.
 * - Implementations live behind a server function; never call vendors from UI.
 */

export interface CostCatalogLookupKey {
  organizationId: string;
  catalogItemKey?: string | null;
  scopeItemKey?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  tradeKey?: string | null;
  actionKey?: string | null;
  regionCode?: string | null;
}

/** Values the future catalog may supply. All optional — a partial hit is valid. */
export interface CostCatalogDefaults {
  catalogItemKey?: string;
  standardDescription?: string;
  categoryKey?: string;
  subcategoryKey?: string;
  unitKey?: string;
  /** Labor hours per unit of measure. */
  laborHoursPerUnit?: number;
  /** Units produced per crew hour (inverse of laborHoursPerUnit). */
  productionRate?: number;
  crewTypeKey?: string;
  laborRate?: number;
  materialAllowance?: number;
  equipmentCost?: number;
  suggestedOverheadPct?: number;
  suggestedProfitPct?: number;
  source?: string;
}

export interface CostCatalogProvider {
  readonly id: string;
  lookup(key: CostCatalogLookupKey): Promise<CostCatalogDefaults | null>;
}

/** Default no-op provider used until a real catalog ships. */
export const nullCostCatalogProvider: CostCatalogProvider = {
  id: "null-catalog",
  async lookup() {
    return null;
  },
};

let activeProvider: CostCatalogProvider = nullCostCatalogProvider;

export function setCostCatalogProvider(provider: CostCatalogProvider) {
  activeProvider = provider;
}

export function getCostCatalogProvider(): CostCatalogProvider {
  return activeProvider;
}

/**
 * Apply catalog defaults to a partial line, never clobbering explicit values.
 * Kept here (not in the UI) so future catalog work is a provider swap only.
 */
export function applyCatalogDefaults<T extends Record<string, unknown>>(
  line: T,
  defaults: CostCatalogDefaults | null,
): T {
  if (!defaults) return line;
  const next: Record<string, unknown> = { ...line };
  const put = (field: string, value: unknown) => {
    if (value == null) return;
    const current = next[field];
    if (current == null || current === "" || current === 0) next[field] = value;
  };
  put("description", defaults.standardDescription);
  put("categoryKey", defaults.categoryKey);
  put("subcategoryKey", defaults.subcategoryKey);
  put("unitKey", defaults.unitKey);
  put("laborRate", defaults.laborRate);
  put("materialCost", defaults.materialAllowance);
  put("equipmentCost", defaults.equipmentCost);
  put("overheadPct", defaults.suggestedOverheadPct);
  put("profitPct", defaults.suggestedProfitPct);
  put("catalogItemKey", defaults.catalogItemKey);
  if (defaults.laborHoursPerUnit != null && !next.laborHours) {
    next.laborHours = defaults.laborHoursPerUnit * Number(next.quantity ?? 1);
  }
  return next as T;
}
