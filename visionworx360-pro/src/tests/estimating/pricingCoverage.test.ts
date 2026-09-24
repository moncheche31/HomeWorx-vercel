/**
 * Pricing coverage regression (Pricing Coverage & Mapping pass).
 *
 * Guards the deterministic phrase → assembly layer against the live Master
 * Suite Garage Conversion scope language. A phrase that silently stops
 * resolving is a pilot blocker, so every phrase below is asserted explicitly.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  allIntentRules,
  intentAssemblyKeys,
  normalizePhrase,
  resolveIntent,
} from "@/domains/estimating/pricing/intentMap";

const seed =
  readFileSync("supabase/seed/knowledge-base-v1.sql", "utf8") +
  "\n" +
  readFileSync("supabase/seed/knowledge-base-v2.sql", "utf8");
const seededKeys = new Set(
  [...seed.matchAll(/^ {2}\((?:1|2), '([a-z0-9._]+)',/gm)].map((m) => m[1]),
);

/** Phrase → assembly keys the engine must resolve, in contractor wording. */
const PRICEABLE: Array<[string, string[]]> = [
  ["Frame walls to code", ["framing.wall.interior"]],
  ["Insulate walls, ceiling, floor — walls", ["insulation.batt.wall"]],
  ["Insulate walls, ceiling, floor — ceiling", ["insulation.batt.ceiling"]],
  ["Insulate walls, ceiling, floor — floor", ["insulation.batt.floor"]],
  ["Close in existing back garage entry door", ["framing.opening.infill"]],
  ["Move and reframe 1 garage window", ["framing.window.reframe"]],
  ["Remove and reframe 1 large egress window", ["framing.window.reframe"]],
  [
    "Cut out and frame opening for new entry door to master bedroom from existing dining room",
    ["framing.header.opening"],
  ],
  ["Remove existing garage partition wall", ["demo.wall.nonbearing"]],
  ["Remove existing back entry door", ["demo.door.remove"]],
  ["Install rough plumbing for bathroom fixtures", ["plumbing.rough.fixture"]],
  ["Building permit", ["permits.building.fee"]],
  ["Electrical permit and inspection", ["permits.electrical.fee", "permits.inspection.schedule"]],
  ["Drywall repair", ["drywall.repair.area"]],
  ["GFCI / AFCI protection", ["electrical.gfci.protect"]],
  ["Shower waterproofing", ["bath.shower.waterproof.system"]],
  ["Shower niche", ["bath.shower.niche"]],
  ["Frameless glass shower", ["bath.shower.glass.frameless"]],
  ["Subfloor prep and leveling", ["flooring.level.selfleveling"]],
  ["Baseboard removal and reinstall", ["trim.base.removereinstall"]],
  ["Electrical relocation", ["electrical.device.relocate"]],
  ["HVAC relocation", ["hvac.relocate.equipment"]],
  ["Paint blending", ["painting.blend.touchup"]],
  ["Plumbing rough-in adjustments", ["plumbing.rough.adjust"]],
  ["Floor patching", ["flooring.patch.area"]],
  ["Transitions and thresholds", ["flooring.transition.strip"]],
  ["Comfort-height toilet", ["access.comfort.toilet"]],
  ["Prime and paint trim", ["painting.trim.base"]],
  [
    "Prime and paint walls and ceilings",
    ["painting.prime.walls", "painting.walls.twocoat", "painting.ceiling"],
  ],
  ["Install interior doors and trim", ["doors.interior.prehung", "trim.casing.door"]],
  ["Remove existing cabinets and countertops", ["demo.cabinets.kitchen"]],
  ["Disconnect and remove appliances", ["demo.appliance.disconnect"]],
  ["Rough plumbing for sink relocation", ["plumbing.rough.fixture"]],
  ["Install new shutoffs and supply lines", ["plumbing.shutoff.valve"]],
  ["Add dedicated appliance circuits", ["electrical.circuit.dedicated"]],
  ["Add GFCI receptacles at counters", ["electrical.gfci.protect"]],
  ["Install base and wall cabinets", ["cabinets.base.install", "cabinets.wall.install"]],
  ["Install/replace baseboards", ["trim.base.install"]],
  ["Vanities", ["cabinets.vanity.install"]],
  ["LVL beam and posts", ["framing.beam.lvl"]],
  // Library v2: bundled room electrical is now a disclosed ballpark allowance
  // rather than a hard stop, so ballpark mode completes with the uncertainty
  // stated instead of blocking the whole estimate.
  ["New circuits, outlets, lighting", ["electrical.room.package.allowance"]],
];

/** Phrases the engine must recognize but refuse to price, with the reason. */
const REVIEW: Array<[string, string]> = [
  ["Install finished flooring", "ambiguous_material_selection"],
  ["Install new kitchen flooring", "ambiguous_material_selection"],
  ["Template and install countertops", "ambiguous_material_selection"],
  ["Remove flooring", "ambiguous_material_selection"],
];

describe("deterministic intent map", () => {
  it("references only assemblies that exist in the seeded library", () => {
    expect(seededKeys.size).toBeGreaterThan(200);
    const missing = intentAssemblyKeys().filter((key) => !seededKeys.has(key));
    expect(missing).toEqual([]);
  });

  it.each(PRICEABLE)("prices %s", (phrase, expected) => {
    const match = resolveIntent(phrase);
    expect(match, `no intent rule matched "${phrase}"`).not.toBeNull();
    expect(match!.rule.review).toBeUndefined();
    expect((match!.rule.components ?? []).map((c) => c.assemblyKey)).toEqual(expected);
  });

  it.each(REVIEW)("holds %s for contractor review", (phrase, reason) => {
    const match = resolveIntent(phrase);
    expect(match, `no intent rule matched "${phrase}"`).not.toBeNull();
    expect(match!.rule.review).toBe(reason);
    expect(match!.rule.components ?? []).toHaveLength(0);
  });

  it("prefers the longest, most specific phrase", () => {
    expect(resolveIntent("Electrical permit and inspection")!.rule.components).toHaveLength(2);
    expect(resolveIntent("Electrical permit")!.rule.components).toHaveLength(1);
    expect(resolveIntent("Remove existing cabinets and countertops")!.normalizedPhrase).toBe(
      "remove existing cabinets and countertops",
    );
  });

  it("stays silent on text it does not know", () => {
    expect(resolveIntent("Install a submarine periscope")).toBeNull();
    expect(resolveIntent("")).toBeNull();
    expect(resolveIntent(null)).toBeNull();
  });

  it("normalizes accents and punctuation like the SQL bridge", () => {
    expect(normalizePhrase("Instalación  de —  gabinetes!")).toBe("instalacion de gabinetes");
  });

  it("keeps every rule well formed", () => {
    for (const rule of allIntentRules()) {
      const hasComponents = (rule.components ?? []).length > 0;
      expect(hasComponents !== Boolean(rule.review)).toBe(true);
      expect(normalizePhrase(rule.phrase)).toBe(rule.phrase.length ? normalizePhrase(rule.phrase) : "");
      for (const component of rule.components ?? []) {
        expect(component.quantityFactor).toBeGreaterThan(0);
      }
    }
  });
});
