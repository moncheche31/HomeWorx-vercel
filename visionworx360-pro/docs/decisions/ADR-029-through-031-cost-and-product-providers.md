# ADR-029 — Localized Cost Data Providers (vendor-independent)

**Status:** Accepted (contracts only, Module 007A)

## Context
VisionWorx360 Pro must eventually supply localized construction cost benchmarks
(labor rates, crew composition, production rates, equipment, installed unit
costs, demolition/disposal, subcontractor allowances, regional factors). Sources
such as RSMeans are licensed products; we do not currently hold a license.

## Decision
- Define provider-independent interfaces in `src/domains/localizedCost/types.ts`:
  `LocalizedCostProvider`, `LaborRateProvider`, `ProductionRateProvider`.
- Localization inputs are carried by `CostLocation` (ZIP, city, county, state,
  vendor `costLocationId`) and every returned value carries `CostDataProvenance`
  (source, source version, effective date, retrievedAt, regional adjustment
  factor, attribution, `isSampleData`).
- `src/domains/localizedCost/registry.ts` ships null providers; the estimate
  engine works with zero external dependencies and gains benchmarks by swapping
  a provider server-side.
- The estimating engine never imports a vendor SDK.

## Constraints
- No proprietary cost data is copied, seeded, or cached beyond license terms.
- Adapters run server-side only; credentials never enter the browser bundle.
- Suggested values never overwrite contractor-entered values.

## Deferred
Licensed adapter implementation (RSMeans or approved equivalent) pending
licensing and credentials.

---

# ADR-030 — Supplier / Manufacturer Product Catalog Providers

**Status:** Accepted (contracts only, Module 007A)

## Context
Estimates and proposals need real selectable products (vanities, faucets,
flooring, lighting, cabinets, appliances, …) with images, specs and pricing.

## Decision
- Interfaces in `src/domains/supplierCatalog/types.ts`:
  `SupplierCatalogProvider`, `ProductSearchProvider`, `ProductPricingProvider`,
  `ProductAvailabilityProvider`, `ProductImageProvider`, plus the
  `NormalizedProduct` model (provider key, supplier product id, manufacturer,
  brand, model, SKU, GTIN, specs, dimensions, finish/color, images, documents,
  warranty, data source, attribution, discontinued/archived, last synced).
- `registry.ts` starts empty; adapters register server-side only when
  credentials and licensing are approved. `isConfigured` gates UI exposure.
- `snapshot.ts` creates immutable `ProductPriceSnapshot` records at selection
  time (product, supplier, store, quoted price, quantity, estimated tax,
  delivery charge, availability, snapshot timestamp, source, attribution).
  Supplier updates can never retroactively change an issued estimate.

## Constraints (non-negotiable)
- **No scraping.** Authorized APIs, approved affiliate feeds, licensed feeds,
  manufacturer data, distributor integrations, or formal partnerships only.
- Credentials are server-side; respect caching, image and resale restrictions.
- Live pricing is flagged `isEstimateOnly` — never presented as guaranteed.
- Organization-negotiated pricing is tenant-isolated.

## Deferred
Lowe's, Home Depot (if authorized), regional lumberyards, plumbing/electrical
/flooring distributors, cabinet and appliance manufacturers, affiliate data
providers. First adapter lands in 007B **only** after credentials exist.

---

# ADR-031 — Product Selections, Value Provenance, and Rendering Honesty

**Status:** Accepted (contracts only, Module 007A)

## Decision
- `src/domains/productSelections/types.ts` defines a Product Selections domain
  separate from estimate math: project / room / scope item / optional estimate
  line, product, status lifecycle (suggested → shortlisted → client-selected →
  contractor-approved → ordered → received → installed → substituted →
  discontinued), quantity, allowance, actual price, allowance variance, customer
  and contractor approval, notes, alternatives, rendering assets, price
  snapshot. Selections are **not** coupled to a single estimate version.
- `src/domains/estimating/valueProvenance.ts` keeps localized benchmark,
  contractor-custom, live supplier price, allowance, price snapshot and actual
  purchased cost as distinct layers, retaining suggested value, adjusted value,
  override reason, source, source version, cost location and timestamp.
- `src/domains/costCatalog/types.ts` defines catalog work items/assemblies for
  Module 007B. Seeding is restricted to licensed data or records explicitly
  flagged `isSampleData: true`.
- Renderings are always labeled conceptual, with `RenderingFidelity` of
  actual-product / visually-similar-substitute / generic-placeholder /
  not-renderable. No promise of exact visual representation.

## Service boundaries
Estimate Engine (math) · Cost Catalog (work definitions) · Localized Cost
Providers (regional benchmarks) · Supplier Catalog Providers (products) ·
Product Selections (client choices) · Rendering · Proposals · Purchasing ·
Job Costing. No vendor may become inseparable from the estimate engine.
