/**
 * Material pricing provider registry.
 *
 * Adapters register a FACTORY (not an instance): a provider only exists once a
 * server handler hands it an org-scoped API key. Adding a vendor later — e.g.
 * an official Lowe's API — is a `registerMaterialPricingProvider` call plus a
 * new enum value, with no change to the estimating engine.
 */

import { bigBoxHomeDepotProviderFactory, BIGBOX_DISPLAY_NAME } from "./providers/bigBoxHomeDepot";
import type {
  MaterialPricingProvider,
  MaterialPricingProviderConfig,
  MaterialPricingProviderFactory,
  MaterialPricingProviderType,
} from "./types";

interface RegisteredProvider {
  providerType: MaterialPricingProviderType;
  displayName: string;
  factory: MaterialPricingProviderFactory;
}

const registry = new Map<MaterialPricingProviderType, RegisteredProvider>();

export function registerMaterialPricingProvider(entry: RegisteredProvider): void {
  registry.set(entry.providerType, entry);
}

export function unregisterMaterialPricingProvider(type: MaterialPricingProviderType): void {
  registry.delete(type);
}

export function listMaterialPricingProviders(): RegisteredProvider[] {
  return [...registry.values()];
}

export function materialPricingProviderLabel(type: MaterialPricingProviderType): string {
  return registry.get(type)?.displayName ?? type;
}

/** Build a live provider instance. Returns null when the type is unknown. */
export function createMaterialPricingProvider(
  config: MaterialPricingProviderConfig,
): MaterialPricingProvider | null {
  const entry = registry.get(config.providerType);
  if (!entry) return null;
  if (!config.apiKey) return null;
  return entry.factory(config);
}

registerMaterialPricingProvider({
  providerType: "bigbox_home_depot",
  displayName: BIGBOX_DISPLAY_NAME,
  factory: bigBoxHomeDepotProviderFactory,
});
