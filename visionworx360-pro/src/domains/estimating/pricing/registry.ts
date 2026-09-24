/**
 * Pricing provider registry. Swap the active provider server-side; the engine
 * and UI never reference a vendor directly.
 */

import { seededPricingProvider } from "./seededProvider";
import type { PricingProvider } from "./types";

export const nullPricingProvider: PricingProvider = {
  id: "null-pricing",
  requiresLicense: false,
  async resolve() {
    return null;
  },
};

let active: PricingProvider = seededPricingProvider;

export function setPricingProvider(provider: PricingProvider) {
  active = provider;
}

export function getPricingProvider(): PricingProvider {
  return active;
}

/** True while only seeded sample pricing is available. */
export function isSeededPricingOnly(): boolean {
  return active.id === seededPricingProvider.id;
}
