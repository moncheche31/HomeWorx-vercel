/**
 * Shared trade-classification matrix.
 *
 * One table, every trade, wording taken from how contractors actually write
 * scope. The contract is not "the classifier is clever" — it is that obvious
 * wording resolves silently, that quality/selection language never becomes
 * work, and that the classifier declines instead of guessing when a line
 * genuinely spans two trades.
 */

import { describe, expect, it } from "vitest";
import {
  classifyTrade,
  hasWorkIntent,
  inferTradeKey,
  resolveTradeKey,
  stripQualityWording,
} from "@/domains/estimating/tradeInference";
import { LABOR_TRADES, UNASSIGNED_TRADE } from "@/domains/estimating/tradeTaxonomy";
import {
  contractorTradeDecisions,
  isFindingDecided,
  validateScope,
  type ScopeDecisionRecord,
  type ScopeValidationItem,
} from "@/domains/scopeValidation";

const item = (over: Partial<ScopeValidationItem> & { id: string; title: string }): ScopeValidationItem => ({
  quantity: 10,
  unitKey: "sf",
  laborHours: 4,
  isLaborBearing: true,
  isPriced: true,
  isIncluded: true,
  ...over,
});

/* ------------------------------------------------------------------ *
 * The matrix
 * ------------------------------------------------------------------ */

const MATRIX: Array<[title: string, expected: string]> = [
  // Painting — the action owns the line whatever surface it names
  ["Prime and paint trim", "painting"],
  ["Paint bedroom walls and ceiling", "painting"],
  ["Paint kitchen cabinets", "painting"],
  ["Repaint garage interior walls", "painting"],
  ["Stain and seal front door", "painting"],

  // Finish carpentry — install action keeps the object's trade
  ["Install paint-grade baseboard and casing", "finish_carpentry"],
  ["Install kitchen cabinets", "finish_carpentry"],
  ["Install crown molding in living room", "finish_carpentry"],
  ["Hang interior doors and install door hardware", "finish_carpentry"],

  // Flooring
  ["Install hardwood flooring", "flooring"],
  ["Mid-grade LVP flooring throughout", "flooring"],
  ["Install carpet and pad in bedrooms", "flooring"],

  // Framing — structural verb beats the surface noun
  ["Frame 15.5 x 18 platform floor", "framing"],
  ["Frame new partition wall with 2x4 studs", "framing"],
  ["Install header over new opening", "framing"],
  ["Sister floor joists at span", "framing"],

  // Electrical
  ["Install GFCI receptacles at counters", "electrical"],
  ["Run new 20 amp circuit to garage", "electrical"],
  ["Replace panel breaker and add AFCI", "electrical"],

  // Plumbing
  ["Install shower valve and trim kit", "plumbing"],
  ["Run new water line to laundry", "plumbing"],
  ["Set toilet and connect drain", "plumbing"],

  // Drywall
  ["Hang tape and mud new drywall", "drywall"],
  ["Patch sheetrock at removed wall", "drywall"],

  // Roofing
  ["Install architectural shingles and underlayment", "roofing"],
  ["Replace step flashing at chimney", "roofing"],

  // Concrete / sitework
  ["Pour concrete slab for addition", "sitework_concrete"],
  ["Form and pour footings", "sitework_concrete"],

  // Tile
  ["Set shower surround tile over cement board", "tile"],
  ["Install kitchen backsplash tile", "tile"],

  // Other trades
  ["Install R-21 batt insulation in exterior walls", "insulation"],
  ["Install mini-split condenser and air handler", "hvac"],
  ["Install hardie siding on rear elevation", "exterior"],
  ["Demo existing garage door and framing", "demolition"],
];

describe("trade classification matrix", () => {
  it.each(MATRIX)("classifies %s as %s", (title, expected) => {
    const result = classifyTrade(title);
    expect(result.trade).toBe(expected);
    expect(LABOR_TRADES).toContain(result.trade!);
  });

  it.each(MATRIX)("is confident enough about %s to avoid asking", (title) => {
    const result = classifyTrade(title);
    expect(result.ambiguous).toBe(false);
    expect(["high", "medium"]).toContain(result.confidence);
  });
});

describe("action outranks object", () => {
  it("keeps the coating task with Painting even on a cabinet", () => {
    expect(classifyTrade("Paint kitchen cabinets").trade).toBe("painting");
    expect(classifyTrade("Install kitchen cabinets").trade).toBe("finish_carpentry");
  });

  it("reads 'paint-grade' as a material spec, not a coating task", () => {
    expect(stripQualityWording("install paint-grade baseboard")).not.toContain("paint");
    expect(classifyTrade("Install paint-grade baseboard and casing").trade).toBe("finish_carpentry");
    expect(classifyTrade("Prime and paint baseboard and casing").trade).toBe("painting");
  });

  it("keeps a framed floor with Framing and an installed floor with Flooring", () => {
    expect(classifyTrade("Frame 15.5 x 18 platform floor").trade).toBe("framing");
    expect(classifyTrade("Install LVP flooring over new platform").trade).toBe("flooring");
  });

  it("lets an exclusive noun beat a location noun", () => {
    expect(classifyTrade("Install GFCI receptacles at counters").trade).toBe("electrical");
    expect(classifyTrade("Install quartz countertop at kitchen").trade).toBe("finish_carpentry");
  });

  it("ignores project context in favour of the stated task", () => {
    /* Same sentence, garage-conversion project: still Flooring. */
    expect(classifyTrade("Install flooring", "garage conversion project").trade).toBe("flooring");
  });
});

describe("quality wording is not work", () => {
  it("never reads 'mid-grade' as site grading", () => {
    expect(classifyTrade("Mid-grade LVP flooring throughout").trade).toBe("flooring");
    expect(classifyTrade("Mid grade finishes in bathroom").trade).not.toBe("sitework_concrete");
  });

  it("does not create countertop work from a countertop level", () => {
    const result = classifyTrade("Premium countertop level");
    expect(result.trade).toBeNull();
    expect(result.confidence).toBe("none");
    expect(hasWorkIntent("Premium countertop level")).toBe(false);
  });

  it("still classifies real countertop work", () => {
    expect(classifyTrade("Install countertop and backsplash return").trade).not.toBeNull();
    expect(hasWorkIntent("Install countertop")).toBe(true);
  });

  it("does not turn a finish-level selection into a trade", () => {
    expect(classifyTrade("Builder grade finish level").trade).toBeNull();
  });

  it("does not treat 'ready for paint' as a painting task", () => {
    expect(classifyTrade("Leave drywall ready for paint").trade).toBe("drywall");
  });
});

describe("genuinely mixed lines are not forced", () => {
  it("flags a two-trade rough-in as ambiguous instead of guessing", () => {
    const result = classifyTrade("Rough-in plumbing and electrical for new bathroom");
    expect(result.ambiguous).toBe(true);
    expect(result.candidates.map((c) => c.trade)).toEqual(
      expect.arrayContaining(["plumbing", "electrical"]),
    );
    expect(inferTradeKey("Rough-in plumbing and electrical for new bathroom")).toBeNull();
  });

  it("stays silent rather than proposing a trade for a mixed line", () => {
    const report = validateScope([
      item({
        id: "mix",
        title: "Rough-in plumbing and electrical for new bathroom",
        tradeKey: "general",
      }),
    ]);
    expect(report.findings.filter((f) => f.kind === "suspicious_trade")).toHaveLength(0);
  });
});

describe("validation only speaks when it is sure", () => {
  it("does not nag about an item the classifier already agrees with", () => {
    const report = validateScope([
      item({ id: "p1", title: "Prime and paint trim", tradeKey: "painting" }),
    ]);
    expect(report.findings.filter((f) => f.kind === "suspicious_trade")).toHaveLength(0);
  });

  it("raises a warning on a genuine contradiction", () => {
    const report = validateScope([
      item({ id: "p2", title: "Install GFCI receptacles at counters", tradeKey: "framing" }),
    ]);
    const finding = report.findings.find((f) => f.kind === "suspicious_trade");
    expect(finding?.suggestedTradeKey).toBe("electrical");
    expect(finding?.severity).toBe("warning");
  });

  it("treats an unlabelled but obvious item as information, not a chore", () => {
    const report = validateScope([
      item({ id: "p3", title: "Install architectural shingles and underlayment", tradeKey: null }),
    ]);
    const finding = report.findings.find((f) => f.kind === "suspicious_trade");
    expect(finding?.severity).toBe("info");
    expect(finding?.suggestedTradeKey).toBe("roofing");
  });

  it("says nothing at all about wording it cannot resolve", () => {
    const report = validateScope([
      item({ id: "p4", title: "Miscellaneous allowance", tradeKey: "specialty" }),
    ]);
    expect(report.findings.filter((f) => f.kind === "suspicious_trade")).toHaveLength(0);
  });
});

describe("contractor overrides win", () => {
  it("never proposes reclassifying an item the contractor assigned", () => {
    const contradicting = item({
      id: "o1",
      title: "Install GFCI receptacles at counters",
      tradeKey: "specialty",
    });
    expect(
      validateScope([contradicting]).findings.filter((f) => f.kind === "suspicious_trade"),
    ).toHaveLength(1);
    expect(
      validateScope([{ ...contradicting, tradeAssignedBy: "contractor" }]).findings.filter(
        (f) => f.kind === "suspicious_trade",
      ),
    ).toHaveLength(0);
  });

  it("reads settled trade decisions back out of the persisted record", () => {
    const decisions: ScopeDecisionRecord[] = [
      { subjectKey: "suspicious_trade:o1", subjectFingerprint: "fp", decision: "reassigned", decidedTradeKey: "specialty" },
      { subjectKey: "suspicious_trade:o2", subjectFingerprint: "fp", decision: "kept", decidedTradeKey: null },
      { subjectKey: "duplicate:o3", subjectFingerprint: "fp", decision: "dismissed" },
    ];
    const map = contractorTradeDecisions(decisions);
    expect([...map.keys()].sort()).toEqual(["o1", "o2"]);
    expect(map.get("o1")).toBe("specialty");
  });

  it("keeps a reassignment answered once the item carries the chosen trade", () => {
    const report = validateScope([
      item({ id: "o4", title: "Install GFCI receptacles at counters", tradeKey: "specialty" }),
    ]);
    const finding = report.findings.find((f) => f.kind === "suspicious_trade")!;
    expect(
      isFindingDecided(finding, [
        {
          subjectKey: finding.subjectKey,
          subjectFingerprint: "stale-fingerprint",
          decision: "reassigned",
          decidedTradeKey: "specialty",
        },
      ]),
    ).toBe(true);
  });
});

describe("existing assignments are never overwritten", () => {
  it("keeps a canonical assignment and only fills a genuine blank", () => {
    expect(resolveTradeKey("cabinets", "Paint kitchen cabinets")).toBe("finish_carpentry");
    expect(resolveTradeKey(null, "Paint kitchen cabinets")).toBe("painting");
    expect(resolveTradeKey(null, "Premium countertop level")).toBe(UNASSIGNED_TRADE);
  });
});
