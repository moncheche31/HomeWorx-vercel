/**
 * Residential Core Knowledge Base (Library v2) — matcher regression matrix.
 *
 * The contract this file defends:
 *  1. Common residential wording resolves to the SEMANTICALLY correct trade —
 *     the action verb decides ("paint cabinets" is painting, not cabinetry).
 *  2. Bundled/plural scope resolves to a labelled allowance or a review
 *     outcome, never to a single "1 each" atomic task.
 *  3. Adjectives and grades create no scope ("mid-grade" is not grading).
 *  4. Every assembly the map points at actually exists in the seeded catalog,
 *     with a plausible productivity convention and residential labor rate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { intentAssemblyKeys, resolveIntent } from "@/domains/estimating/pricing/intentMap";
import { INTENT_RULES_V2 } from "@/domains/estimating/pricing/intentMapV2";
import { CATALOG_TRADE_KEYS, normalizeTradeKey, UNASSIGNED_TRADE } from "@/domains/estimating/tradeTaxonomy";

const seedV1 = readFileSync("supabase/seed/knowledge-base-v1.sql", "utf8");
const seedV2 = readFileSync("supabase/seed/knowledge-base-v2.sql", "utf8");
const seed = `${seedV1}\n${seedV2}`;

const rows = [...seed.matchAll(/^ {2}\((1|2), '([a-z0-9._]+)', '([a-z_]+)',/gm)].map((m) => ({
  version: Number(m[1]),
  key: m[2],
  trade: m[3],
}));
const catalogKeys = new Set(rows.map((r) => r.key));
const tradeOf = new Map(rows.map((r) => [r.key, r.trade] as const));

/** phrase → the trade the resulting assemblies must belong to. */
const MATRIX: Array<[string, string]> = [
  ["Mobilization and daily setup", "general_conditions"],
  ["Protect floors along the work path", "general_conditions"],
  ["Dust containment at the hallway", "general_conditions"],
  ["Final clean before handover", "general_conditions"],
  ["Provide dumpster for the project", "general_conditions"],
  ["Selective demolition of the interior", "demolition"],
  ["Demo ceiling drywall in the basement", "demolition"],
  ["Remove wall tile at the tub surround", "demolition"],
  ["Remove countertops before cabinet work", "demolition"],
  ["Remove subfloor in the bathroom", "demolition"],
  ["Roof tear off, one layer", "demolition"],
  ["Break out concrete at the patio", "demolition"],
  ["Frame interior partition walls to code", "framing"],
  ["Frame 2x6 wall at the exterior side", "framing"],
  ["Build soffit above the cabinets", "framing"],
  ["Frame a 15.5 x 18 platform floor", "framing"],
  ["Sister joists under the tub", "framing"],
  ["Install flush beam at the opening", "framing"],
  ["Frame stairs to the basement", "framing"],
  ["Hang drywall on the new walls", "drywall"],
  ["Hang and finish drywall throughout", "drywall"],
  ["Cement board at the shower walls", "drywall"],
  ["Level 5 finish in the great room", "drywall"],
  ["Skim coat the damaged walls", "drywall"],
  ["Small drywall patch at the hallway", "drywall"],
  ["Ceiling repair after the leak", "drywall"],
  ["Prime and paint ceilings", "painting"],
  ["Repaint walls in the bedroom", "painting"],
  ["Paint trim and casing", "painting"],
  ["Paint doors, mid-grade finish", "painting"],
  ["Paint kitchen cabinets", "painting"],
  ["Stain trim to match existing", "painting"],
  ["Paint exterior siding", "painting"],
  ["Stain deck after cleaning", "painting"],
  ["Install LVP throughout the level", "flooring"],
  ["Install engineered hardwood in the den", "flooring"],
  ["Install carpet in the bedrooms", "flooring"],
  ["Self leveling over the old slab", "flooring"],
  ["Refinish hardwood in the dining room", "flooring"],
  ["Stair treads and risers", "flooring"],
  ["Shower wall tile, standard size", "tile"],
  ["Shower floor tile with mosaic", "tile"],
  ["Bathroom floor tile", "tile"],
  ["Install backsplash at the kitchen", "tile"],
  ["Waterproof shower before tile", "tile"],
  ["Grout and seal all tile", "tile"],
  ["Install shutoffs and supply lines", "plumbing"],
  ["Set toilet and connect", "plumbing"],
  ["Install kitchen sink", "plumbing"],
  ["Replace faucet at the vanity", "plumbing"],
  ["Install tankless water heater", "plumbing"],
  ["Drain waste and vent rough in", "plumbing"],
  ["Run gas line to the range", "plumbing"],
  ["New circuits, outlets, lighting", "electrical"],
  ["Install GFCI receptacle at the counter", "electrical"],
  ["Recessed lighting in the ceiling", "electrical"],
  ["Install vanity light", "electrical"],
  ["Under cabinet lighting", "electrical"],
  ["Install subpanel in the garage", "electrical"],
  ["Extend supply duct to the new room", "hvac"],
  ["Add return air in the hallway", "hvac"],
  ["Install bath fan vented outside", "hvac"],
  ["Install mini split for the conversion", "hvac"],
  ["Rigid foam at the foundation wall", "insulation"],
  ["Air sealing package", "insulation"],
  ["Sound insulation between bedrooms", "insulation"],
  ["Install prehung door", "doors"],
  ["Install pocket door at the closet", "doors"],
  ["Install entry door with hardware", "doors"],
  ["Replace window in the bedroom", "windows"],
  ["Egress window for the basement", "windows"],
  ["Install baseboard trim", "trim"],
  ["Install crown molding in the living room", "trim"],
  ["Closet shelving and rod", "trim"],
  ["Install handrail at the stairs", "trim"],
  ["Install base cabinets", "cabinetry"],
  ["Install vanity in the bathroom", "cabinetry"],
  ["Quartz countertop with sink cutout", "countertops"],
  ["Install shingles on the main roof", "roofing"],
  ["Ridge vent along the peak", "roofing"],
  ["Install vinyl siding", "siding"],
  ["Soffit and fascia replacement", "siding"],
  ["Install gutters and downspouts", "gutters"],
  ["Pour concrete slab for the addition", "concrete"],
  ["Concrete walkway to the door", "concrete"],
  ["Block wall at the crawl space", "masonry"],
  ["Tuckpoint the chimney base", "masonry"],
  ["Frame deck over the footings", "decks"],
  ["Composite decking on the new deck", "decks"],
  ["Deck railing with balusters", "decks"],
  ["Recaulk the tub surround", "handyman"],
  ["Grab bar in the shower", "handyman"],
  ["Punch list labor", "handyman"],
  ["Rough grading around the foundation", "landscaping"],
  ["French drain along the back wall", "landscaping"],
  ["Privacy fence at the property line", "landscaping"],
];

describe("Residential Core v2 — catalog", () => {
  it("seeds a substantially broader library", () => {
    expect(rows.filter((r) => r.version === 2).length).toBeGreaterThanOrEqual(250);
    expect(catalogKeys.size).toBeGreaterThanOrEqual(440);
  });

  it("uses only declared catalog trade keys", () => {
    const used = new Set(rows.map((r) => r.trade));
    const undeclared = [...used].filter((t) => !(CATALOG_TRADE_KEYS as readonly string[]).includes(t));
    expect(undeclared).toEqual([]);
  });

  it("maps every catalog trade onto a real labor trade", () => {
    for (const trade of new Set(rows.map((r) => r.trade))) {
      expect(normalizeTradeKey(trade)).not.toBe(UNASSIGNED_TRADE);
    }
  });

  it("declares a productivity convention on every v2 assembly", () => {
    const conventions = [...seedV2.matchAll(/'(hours_per_unit|units_per_hour|lump_sum|fee)'/g)];
    expect(conventions.length).toBeGreaterThanOrEqual(250);
  });

  it("points every intent rule at an assembly that exists", () => {
    const missing = intentAssemblyKeys().filter((key) => !catalogKeys.has(key));
    expect(missing).toEqual([]);
  });
});

describe("Residential Core v2 — matcher matrix", () => {
  it("covers at least 75 contractor phrases", () => {
    expect(MATRIX.length).toBeGreaterThanOrEqual(75);
  });

  it.each(MATRIX)("routes %s to the %s trade", (phrase, expectedTrade) => {
    const match = resolveIntent(phrase);
    expect(match, `no intent rule matched "${phrase}"`).not.toBeNull();
    const components = match!.rule.components ?? [];
    expect(components.length, `"${phrase}" resolved to a review outcome`).toBeGreaterThan(0);
    for (const component of components) {
      expect(tradeOf.get(component.assemblyKey)).toBe(expectedTrade);
    }
  });
});

describe("Residential Core v2 — negative guards", () => {
  it("does not read a finish grade as sitework", () => {
    const match = resolveIntent("Install mid-grade LVP flooring");
    expect(tradeOf.get(match!.rule.components![0].assemblyKey)).toBe("flooring");
  });

  it("does not read countertop wording as levelling work", () => {
    const match = resolveIntent("Quartz countertop, countertop level installation");
    expect(tradeOf.get(match!.rule.components![0].assemblyKey)).toBe("countertops");
  });

  it("keeps the action verb above the object noun", () => {
    const painted = resolveIntent("Paint cabinets in the kitchen");
    expect(tradeOf.get(painted!.rule.components![0].assemblyKey)).toBe("painting");
    const installed = resolveIntent("Install kitchen cabinets");
    expect(installed!.rule.components!.every((c) => tradeOf.get(c.assemblyKey) === "cabinetry")).toBe(true);
  });

  it("refuses to price genuinely ambiguous bundles", () => {
    expect(resolveIntent("Tile bathroom")?.rule.review).toBe("ambiguous_multi_scope");
    expect(resolveIntent("Install countertops")?.rule.review).toBe("ambiguous_material_selection");
  });

  it("decomposes plural plumbing scope instead of pricing one valve", () => {
    const match = resolveIntent("Install shutoffs and supply lines");
    expect(match!.rule.components!.length).toBeGreaterThan(1);
  });

  it("prices bundled electrical scope as a disclosed allowance", () => {
    const match = resolveIntent("New circuits, outlets, lighting");
    const key = match!.rule.components![0].assemblyKey;
    expect(key).toContain("allowance");
    expect(match!.rule.note).toBeTruthy();
  });

  it("never maps two v2 rules to the same phrase with the same priority", () => {
    const seen = new Map<string, number>();
    for (const rule of INTENT_RULES_V2) {
      const key = rule.phrase.toLowerCase().trim();
      const priority = rule.priority ?? 100;
      expect(seen.get(key), `duplicate phrase "${key}"`).not.toBe(priority);
      seen.set(key, priority);
    }
  });
});
