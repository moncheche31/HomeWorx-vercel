# Diagnostic: Current Pricing Data Sourcing (read-only findings)

No code or data was changed. This is a current-state report only.

## 1. Where pricing comes from today

Pricing is a **static internal catalog seeded by migration, plus a small set of contractor-controlled global settings, plus an (empty) override layer**. There is no external data anywhere in the chain.

Layers actually in effect today, highest wins (`src/domains/costBook/precedence.ts`):

```text
contractor manual value typed on a line
  > this-estimate override        (org_assembly_overrides: 0 rows)
  > company Cost Book override    (org_assemblies: 0 rows)
  > jurisdiction schedule         (permit_fee_rules: 22 rows — permits only)
  > VisionWorx catalog baseline   (catalog_assemblies: 684 rows)
```

Catalog size and provenance:
- `catalog_assemblies`: **684 rows**, across 2 library versions.
- **All 684 rows are flagged `is_sample_data = true`; zero rows are marked as real/verified data.**
- They were populated by hand-authored `INSERT` statements inside 9 SQL migration files — not imported from any pricing publisher or feed.
- Per-assembly the catalog carries: `production_rate` / `default_labor_hours` / `setup_hours` / `crew_size` (productivity), `material_allowance`, `material_cost_low`/`_high`, `waste_factor`, `equipment_requirements`, and suggested markup/overhead/profit. 27 rows have no material cost; 23 have no production rate.
- **The catalog contains no labor $ rate at all.** Labor dollars = catalog hours × a single organization-level hourly rate.

Contractor-entered inputs (organization row, 1 org present):
- `default_labor_rate` = **$85/hr** — one flat rate for every trade, every crew, every task.
- `default_pricing_method` = target gross margin, `default_target_gross_margin_pct` = 40, overhead 10 / profit 10, `tax_rate` = 0.

Ballpark path: `src/domains/ballpark/pricebook.ts` is a separate ~40-entry table whose own header says the numbers are *"deliberately illustrative… round, national-feeling placeholder numbers… not market data."* Overlapping subjects are pulled from the shared canonical registry so ballpark and detailed agree, but ballpark-only entries are hardcoded literals in that file.

So: **blend of hardcoded sample catalog (hours + material allowances) and one contractor-entered flat labor rate + margin settings.** No contractor has entered a single per-assembly override yet.

## 2. External pricing integrations

There are **integration seams but zero live integrations** — every provider slot is wired to a null implementation and nothing ever registers a real one.

- `src/domains/localizedCost/registry.ts` — `LocalizedCostProvider`, `LaborRateProvider`, `ProductionRateProvider` interfaces exist with `getUnitCost()` / `getRegionalAdjustment()` / `getLaborRate()`. Ships `nullLocalizedCostProvider` etc. that always return `null`. The file's own comment names "RSMeans or other approved source" as the intended future adapter. `setLocalizedCostProvider()` is **never called** in app code.
- `src/domains/supplierCatalog/registry.ts` — provider map for supplier feeds ("Lowe's, distributors, manufacturer feeds"). The map is **empty**; `hasSupplierCatalog()` returns false.
- `src/domains/estimating/costCatalog.ts` — `CostCatalogProvider` interface (accepts a `regionCode`), with `nullCostCatalogProvider`. `setCostCatalogProvider()` is **never called**.
- `src/domains/knowledge/providers.ts` — explicitly documented as deterministic: "nothing here reaches the network, calls an AI model, or scrapes anything."
- No outbound `fetch()` to any pricing endpoint exists in the estimating or pricing code.

Conclusion: three unused, stubbed extension points designed for exactly this, and no partial implementation behind any of them.

## 3. Regional / location awareness

**Materially, no — it is a flat national table.** Two partial exceptions:

- **Permits are genuinely jurisdiction-aware.** `permit_fee_rules` (22 rows) matches on `jurisdiction_scope / city / county / state / postal_code / country_code` and carries `source_type`, `source_title`, `source_url`, `confidence`, `effective_date`. This is the only pricing data in the app with a cited source and a location key.
- **Location is captured but unused for cost.** The organization has `city` (Atkinson) / `region` (NH), and properties carry city/county/postal code, but no cost multiplier consumes them. `getRegionalAdjustment()` exists on the interface and always returns null. `regionCode` is accepted by the catalog lookup key and never read.

Everything else — 684 assemblies, the $85/hr labor rate, the ballpark pricebook — is one national set of numbers with no ZIP, metro, or state adjustment.

## 4. What happens when a price is stale or wrong

Three distinct paths, with very different friction:

**A. Per-assembly, no code change (exists and works):** the Cost Book page (`/app/cost-book`, `CostBookPage.tsx` + `costBook.functions.ts`) lets the contractor override, per catalog assembly, `hoursPerUnit`, `setupHours`, `minTaskHours`, `materialUnitCost`, `equipmentCost`, `otherCost`, `directUnitCost` — saved into `org_assemblies` / `org_assembly_overrides`, with reset-to-baseline and change history. The baseline is never mutated. **Currently 0 rows: nobody has used it.**

**B. Global settings, no code change:** labor rate, pricing method, margin/overhead/profit via the estimate settings dialog and the organization pricing strategy card. Also per-line manual entry inside an estimate, which is always authoritative.

**C. Everything else requires a code change / migration:**
- Fixing the shipped baseline for all orgs (a wrong `material_allowance` or `production_rate` in `catalog_assemblies`) requires a new SQL migration — there is no admin UI over the baseline.
- Adding a new assembly to the catalog requires a migration.
- Ballpark-only numbers in `pricebook.ts` are TypeScript literals — code change and redeploy.
- No `effective_date`, `priced_as_of`, or staleness flag exists on `catalog_assemblies`. Nothing in the system can tell a contractor a number is old; permits are the only table with `effective_date`.

## Summary of the honest current state

- 684 assemblies, **all sample data**, hand-authored in migrations, no source citation, no as-of date.
- Labor is one flat $85/hr across every trade; the catalog only supplies hours.
- Zero regional cost adjustment outside permits.
- Three purpose-built provider seams sit unused, so wiring a real source is a provider registration rather than an engine rewrite.
- Contractors can already correct any assembly through the Cost Book without a developer — but the shipped baseline itself is migration-only.

## Next step

No provider recommendations or implementation plan included, per the request. Approve to close out the diagnostic, or tell me which of these you want investigated further before any build decision.
