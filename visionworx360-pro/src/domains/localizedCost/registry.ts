/**
 * Provider registry for localized cost data (Module 007A).
 *
 * Ships with null providers so the estimating engine is fully functional with
 * zero external dependencies. A licensed adapter (RSMeans or other approved
 * source) is registered server-side once credentials exist — no engine change.
 */

import type {
  LaborRateProvider,
  LocalizedCostProvider,
  ProductionRateProvider,
} from "./types";

export const nullLocalizedCostProvider: LocalizedCostProvider = {
  id: "null-localized-cost",
  requiresLicense: false,
  async getUnitCost() {
    return null;
  },
  async getRegionalAdjustment() {
    return null;
  },
};

export const nullLaborRateProvider: LaborRateProvider = {
  id: "null-labor-rate",
  async getLaborRate() {
    return null;
  },
};

export const nullProductionRateProvider: ProductionRateProvider = {
  id: "null-production-rate",
  async getProductionRate() {
    return null;
  },
};

let costProvider: LocalizedCostProvider = nullLocalizedCostProvider;
let laborProvider: LaborRateProvider = nullLaborRateProvider;
let productionProvider: ProductionRateProvider = nullProductionRateProvider;

export function setLocalizedCostProvider(provider: LocalizedCostProvider) {
  costProvider = provider;
}
export function getLocalizedCostProvider(): LocalizedCostProvider {
  return costProvider;
}

export function setLaborRateProvider(provider: LaborRateProvider) {
  laborProvider = provider;
}
export function getLaborRateProvider(): LaborRateProvider {
  return laborProvider;
}

export function setProductionRateProvider(provider: ProductionRateProvider) {
  productionProvider = provider;
}
export function getProductionRateProvider(): ProductionRateProvider {
  return productionProvider;
}

/** True while no licensed benchmark source is wired up. */
export function hasLocalizedCostData(): boolean {
  return costProvider.id !== nullLocalizedCostProvider.id;
}
