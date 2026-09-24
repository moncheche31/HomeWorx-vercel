import { describe, expect, it } from "vitest";
import {
  CATALOG_TRADE_KEYS,
  normalizeTradeKey,
  UNASSIGNED_TRADE,
} from "@/domains/estimating/tradeTaxonomy";
import {
  KNOWN_UNIT_KEYS,
  WORK_PATTERNS,
  checkQuantitySanity,
  extractZones,
  recognizeWork,
} from "@/domains/workRecognition";

/**
 * Cross-trade regression suite for the generic work-recognition engine.
 *
 * Every scenario below exercises the SAME code path — there is no per-trade
 * branch to test individually. What is asserted is the behaviour the product
 * promises: explicit scope wins, media is contextual, geometry derives,
 * defaults are visible, and nothing implausible prices silently.
 */

const item = (result: ReturnType<typeof recognizeWork>, key: string) =>
  result.items.find((i) => i.workTypeKey === key);

describe("work recognition — architecture invariants", () => {
  it("every pattern maps to a canonical catalog trade and a known unit", () => {
    for (const pattern of WORK_PATTERNS) {
      expect(CATALOG_TRADE_KEYS).toContain(pattern.trade);
      expect(KNOWN_UNIT_KEYS).toContain(pattern.unitKey);
      expect(normalizeTradeKey(pattern.trade)).not.toBe(UNASSIGNED_TRADE);
    }
  });

  it("work type keys are unique", () => {
    const keys = WORK_PATTERNS.map((p) => p.workTypeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("geometry extraction", () => {
  it("reads dimension pairs, stated areas and ceiling heights", () => {
    const zones = extractZones(
      "Build a 12x16 deck out back. The kitchen is 12 by 14 with 9 foot ceilings. Roof is 1,500 sq ft.",
    );
    const deck = zones.find((z) => z.key === "deck");
    expect(deck?.areaSf).toBe(192);
    expect(deck?.perimeterLf).toBe(56);

    const kitchen = zones.find((z) => z.key === "kitchen");
    expect(kitchen?.areaSf).toBe(168);
    expect(kitchen?.heightFt).toBe(9);

    const roof = zones.find((z) => z.key === "roof");
    expect(roof?.areaSf).toBe(1500);
    // A stated area alone must not invent a perimeter.
    expect(roof?.perimeterLf).toBeNull();
  });
});

describe("cross-trade quantity resolution", () => {
  it("deck: prices the stated footprint, not an inflated one", () => {
    const result = recognizeWork({ text: "Build a new 12x16 deck with railing and stairs." });
    const deck = item(result, "deck.surface")!;
    expect(deck.quantity).toBe(192);
    expect(deck.action).toBe("build");
    // 10% waste, rounded up — geometry stays exact.
    expect(deck.pricingQuantity).toBe(212);
    expect(item(result, "deck.railing")?.quantity).toBe(56);
    expect(item(result, "deck.stairs")?.quantity).toBe(1);
    expect(checkQuantitySanity(result.items, result.zones).some((f) => f.severity === "block")).toBe(
      false,
    );
  });

  it("painting: derives wall area from perimeter and height with visible assumptions", () => {
    const result = recognizeWork({ text: "Paint the living room, it's 12 by 14 with 8 foot ceilings." });
    const paint = item(result, "paint.walls")!;
    // 2*(12+14) = 52 LF * 8' = 416 SF, less 10% for openings.
    expect(paint.quantity).toBeCloseTo(374.4, 1);
    expect(paint.assumptions.map((a) => a.id)).toContain("opening-deduction");
    // Ceilings were never mentioned, so they are not priced.
    expect(item(result, "paint.ceilings")).toBeUndefined();
  });

  it("painting: an unstated ceiling height is disclosed as an assumption", () => {
    const result = recognizeWork({ text: "Paint the bedroom, 10 by 12." });
    const paint = item(result, "paint.walls")!;
    expect(paint.assumptions.map((a) => a.id)).toContain("ceiling-height");
  });

  it("flooring: floor area comes from the room, and floor-level talk is not scope", () => {
    const priced = recognizeWork({ text: "Replace the flooring in the 12x14 kitchen." });
    expect(item(priced, "flooring.surface")?.quantity).toBe(168);
    expect(item(priced, "flooring.surface")?.action).toBe("replace");

    const notScope = recognizeWork({ text: "Outlets are 18 inches above the floor." });
    expect(item(notScope, "flooring.surface")).toBeUndefined();
  });

  it("windows: counts what was stated and never multiplies it", () => {
    const result = recognizeWork({ text: "Replace six windows on the front of the house." });
    const windows = item(result, "windows.openings")!;
    expect(windows.quantity).toBe(6);
    expect(windows.isAllowance).toBe(false);
    expect(checkQuantitySanity(result.items, result.zones).some((f) => f.severity === "block")).toBe(
      false,
    );
  });

  it("roofing: derives roof area from footprint and reports it in squares", () => {
    const result = recognizeWork({ text: "Replace the roof, footprint is 1200 sq ft." });
    const roof = item(result, "roofing.covering")!;
    // 1200 SF footprint x 1.3 pitch factor = 1560 SF = 15.6 squares.
    expect(roof.unitKey).toBe("roofing_square");
    expect(roof.quantity).toBe(15.6);
    expect(roof.assumptions.map((a) => a.id)).toContain("roof-pitch");
  });


  it("plumbing and electrical: fixtures and devices resolve independently", () => {
    const result = recognizeWork({
      text: "Install three new outlets. Replace the vanity and the toilet.",
    });
    expect(item(result, "electrical.devices")?.quantity).toBe(3);
    expect(item(result, "plumbing.fixtures")?.action).toBe("replace");
  });

  it("recognizes reversed outlet-relocation grammar as one device relocation", () => {
    const result = recognizeWork({
      text: "One existing outlet needs to be relocated from 18 inches AFF to 36 inches AFF.",
    });
    const device = item(result, "electrical.devices")!;
    expect(device.action).toBe("relocate");
    expect(device.quantity).toBe(1);
    expect(device.unitKey).toBe("each");
  });

  it("basement: multiple zones aggregate into one quantity", () => {
    const result = recognizeWork({
      text: "Finish the basement: install flooring in the 20x30 basement and the 10x12 office.",
    });
    expect(item(result, "flooring.surface")?.quantity).toBe(720);
  });

  it("built-ins: overall width prices the work, component detail only refines", () => {
    const result = recognizeWork({
      text: "Build built-ins along the 16 foot wall",
      confirmedMeasurements: [
        { label: "Built-in wall", subject: "built-ins", inches: 192, status: "confirmed" },
      ],
    });
    const builtIn = item(result, "carpentry.builtin")!;
    expect(builtIn.quantity).toBe(16);
    expect(builtIn.provenanceSource).toBe("typed_measurement");
  });

  it("demolition: an explicit wall removal is scope, a mentioned wall is not", () => {
    const removal = recognizeWork({ text: "Remove the wall between the kitchen and dining room." });
    expect(item(removal, "demolition.wall")?.action).toBe("remove");

    const mention = recognizeWork({ text: "The wall has a window in it." });
    expect(item(mention, "demolition.wall")).toBeUndefined();
    expect(mention.observations.some((o) => o.workTypeKey === "demolition.wall")).toBe(true);
  });
});

describe("authority hierarchy", () => {
  it("a confirmed measurement outranks anything said in the transcript", () => {
    const result = recognizeWork({
      text: "Built-ins on the wall, call it about 10 feet",
      confirmedMeasurements: [
        {
          label: "Built-in run",
          subject: "built-ins",
          inches: 94,
          status: "confirmed",
          rawText: `7' 10"`,
        },
      ],
    });
    const builtIn = item(result, "carpentry.builtin")!;
    expect(builtIn.quantity).toBeCloseTo(7.83, 2);
    // Exact geometry stays exact; only pricing rounds up.
    expect(builtIn.pricingQuantity).toBe(8);
    expect(builtIn.provenanceEvidence).toBe(`7' 10"`);
  });

  it("media is contextual: it never overrides a stated count", () => {
    const stated = recognizeWork({
      text: "Replace six windows.",
      media: [{ mediaId: "m1", workTypeKey: "windows.openings", count: 14, note: "front elevation" }],
    });
    expect(item(stated, "windows.openings")?.quantity).toBe(6);
    expect(item(stated, "windows.openings")?.provenanceSource).toBe("spoken_measurement");

    const mediaOnly = recognizeWork({
      text: "Replace the windows.",
      media: [{ mediaId: "m1", workTypeKey: "windows.openings", count: 4, note: "front elevation" }],
    });
    expect(item(mediaOnly, "windows.openings")?.quantity).toBe(4);
    expect(item(mediaOnly, "windows.openings")?.provenanceSource).toBe("photo_inference");
  });

  it("allowances are last resort and always disclosed", () => {
    const result = recognizeWork({ text: "Replace the doors." });
    const doors = item(result, "doors.openings")!;
    expect(doors.isAllowance).toBe(true);
    expect(doors.provenanceSource).toBe("assembly_default");
    expect(result.clarifications.some((c) => c.id === "doors.openings:quantity")).toBe(true);
  });
});

describe("negative scope suppression", () => {
  it("drops excluded work and records why", () => {
    const result = recognizeWork({
      text: "Replace the flooring in the 12x14 kitchen, no painting, and the homeowner will handle the electrical.",
    });
    expect(item(result, "paint.walls")).toBeUndefined();
    expect(item(result, "electrical.devices")).toBeUndefined();
    expect(item(result, "flooring.surface")?.quantity).toBe(168);
    expect(result.suppressed.map((s) => s.exclusionId)).toContain("painting");
    expect(result.exclusions.map((e) => e.id)).toEqual(
      expect.arrayContaining(["painting", "electrical"]),
    );
  });
});

describe("generic sanity gate", () => {
  it("blocks a quantity the job's own geometry cannot support", () => {
    const zones = extractZones("The kitchen is 10x10.");
    const findings = checkQuantitySanity(
      [
        {
          id: "work:flooring.surface",
          workTypeKey: "flooring.surface",
          label: "Flooring",
          trade: "flooring",
          action: "replace",
          actionEvidence: "replace",
          quantity: 4000,
          pricingQuantity: 4400,
          unitKey: "square_foot",
          family: "area",
          provenanceSource: "photo_inference",
          provenanceEvidence: null,
          rationale: "",
          confidence: 0.5,
          assumptions: [],
          exclusions: [],
          zoneIds: [],
          measurementIds: [],
          mediaIds: [],
          isAllowance: false,
        },
      ],
      zones,
    );
    expect(findings.some((f) => f.severity === "block")).toBe(true);
  });
});
