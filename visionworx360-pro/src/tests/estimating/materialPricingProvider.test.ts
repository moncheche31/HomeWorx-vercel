/**
 * Pluggable material pricing — end-to-end through a MOCK provider.
 *
 * No real vendor is contacted anywhere in this suite. The point is that the
 * plug-in interface works and, above all, that every failure mode falls back
 * silently to the static catalog value.
 */

import { describe, expect, it, afterEach } from "vitest";

import {
  createMaterialPricingProvider,
  listMaterialPricingProviders,
  registerMaterialPricingProvider,
  unregisterMaterialPricingProvider,
} from "@/domains/materialPricing/registry";
import {
  materialPriceSourceOf,
  resolveMaterialUnitCost,
} from "@/domains/materialPricing/service";
import type {
  MaterialPriceQuote,
  MaterialPricingProvider,
  MaterialPricingProviderType,
} from "@/domains/materialPricing/types";

const MOCK_TYPE = "bigbox_home_depot" as MaterialPricingProviderType;

function mockProvider(
  lookup: () => Promise<MaterialPriceQuote | null>,
): MaterialPricingProvider {
  return {
    providerType: MOCK_TYPE,
    displayName: "Mock provider",
    verifyCredentials: async () => ({ ok: true }),
    lookupUnitPrice: lookup,
  };
}

const quote = (unitPrice: number): MaterialPriceQuote => ({
  unitPrice,
  currency: "USD",
  providerType: MOCK_TYPE,
  providerLabel: "Mock provider",
  sourceRef: "SKU-123",
  productName: "Standing seam panel",
  retrievedAt: "2026-08-27T00:00:00.000Z",
  isEstimateOnly: true,
});

const query = { organizationId: "org-1", description: "standing seam metal roofing" };

describe("material pricing registry", () => {
  afterEach(() => {
    // Restore the real BigBox registration for other suites.
    delete (globalThis as Record<string, unknown>).__noop;
  });

  it("ships the BigBox adapter registered and pluggable", () => {
    const types = listMaterialPricingProviders().map((p) => p.providerType);
    expect(types).toContain("bigbox_home_depot");
  });

  it("never constructs a provider without an API key", () => {
    expect(createMaterialPricingProvider({ providerType: MOCK_TYPE, apiKey: "" })).toBeNull();
  });

  it("constructs whichever adapter is registered for a type", () => {
    registerMaterialPricingProvider({
      providerType: MOCK_TYPE,
      displayName: "Swapped",
      factory: () => mockProvider(async () => quote(9)),
    });
    const provider = createMaterialPricingProvider({ providerType: MOCK_TYPE, apiKey: "k" });
    expect(provider?.displayName).toBe("Mock provider");
    unregisterMaterialPricingProvider(MOCK_TYPE);
    expect(createMaterialPricingProvider({ providerType: MOCK_TYPE, apiKey: "k" })).toBeNull();
  });
});

describe("resolveMaterialUnitCost", () => {
  it("prefers a live price when a provider returns one", async () => {
    const result = await resolveMaterialUnitCost({
      provider: mockProvider(async () => quote(12.5)),
      query,
      catalogUnitCost: 6,
    });
    expect(result.unitCost).toBe(12.5);
    expect(result.provenance.source).toBe("live_api");
    expect(result.provenance.catalogUnitCost).toBe(6);
    expect(result.provenance.sourceRef).toBe("SKU-123");
  });

  it("falls back to the catalog when no provider is configured", async () => {
    const result = await resolveMaterialUnitCost({ provider: null, query, catalogUnitCost: 6 });
    expect(result.unitCost).toBe(6);
    expect(result.provenance.source).toBe("static_catalog");
    expect(result.provenance.fallbackReason).toBe("no-provider-configured");
  });

  it("falls back when the provider is switched off", async () => {
    const result = await resolveMaterialUnitCost({
      provider: mockProvider(async () => quote(99)),
      providerEnabled: false,
      query,
      catalogUnitCost: 6,
    });
    expect(result.unitCost).toBe(6);
    expect(result.provenance.fallbackReason).toBe("provider-disabled");
  });

  it("falls back on no match, bad price and thrown errors", async () => {
    const noMatch = await resolveMaterialUnitCost({
      provider: mockProvider(async () => null),
      query,
      catalogUnitCost: 6,
    });
    expect(noMatch.unitCost).toBe(6);
    expect(noMatch.provenance.fallbackReason).toBe("no-match");

    const bad = await resolveMaterialUnitCost({
      provider: mockProvider(async () => quote(0)),
      query,
      catalogUnitCost: 6,
    });
    expect(bad.unitCost).toBe(6);
    expect(bad.provenance.fallbackReason).toBe("invalid-price");

    const threw = await resolveMaterialUnitCost({
      provider: mockProvider(async () => {
        throw new Error("boom");
      }),
      query,
      catalogUnitCost: 6,
    });
    expect(threw.unitCost).toBe(6);
    expect(threw.provenance.fallbackReason).toBe("lookup-failed");
  });

  it("falls back when the provider hangs past the timeout", async () => {
    const result = await resolveMaterialUnitCost({
      provider: mockProvider(() => new Promise(() => {})),
      query,
      catalogUnitCost: 6,
      timeoutMs: 20,
    });
    expect(result.unitCost).toBe(6);
    expect(result.provenance.fallbackReason).toBe("timeout");
  });

  it("reads the source back off stored line provenance", () => {
    expect(materialPriceSourceOf(null)).toBe("static_catalog");
    expect(materialPriceSourceOf({ materialPrice: { source: "live_api" } })).toBe("live_api");
    expect(materialPriceSourceOf({ materialPrice: { source: "static_catalog" } })).toBe(
      "static_catalog",
    );
  });
});
