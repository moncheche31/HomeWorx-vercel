/**
 * Supplier catalog provider registry (Module 007A).
 *
 * Empty by default. Adapters (Lowe's, distributors, manufacturer feeds, …) are
 * registered server-side only after credentials and licensing are approved.
 */

import type { SupplierCatalogProvider } from "./types";

const providers = new Map<string, SupplierCatalogProvider>();

export function registerSupplierCatalogProvider(provider: SupplierCatalogProvider) {
  providers.set(provider.id, provider);
}

export function unregisterSupplierCatalogProvider(id: string) {
  providers.delete(id);
}

export function getSupplierCatalogProvider(id: string): SupplierCatalogProvider | null {
  return providers.get(id) ?? null;
}

/** Only providers that are actually credentialed/licensed right now. */
export function listConfiguredSupplierProviders(): SupplierCatalogProvider[] {
  return [...providers.values()].filter((p) => p.isConfigured);
}

export function hasSupplierCatalog(): boolean {
  return listConfiguredSupplierProviders().length > 0;
}
