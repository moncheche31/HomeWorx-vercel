import { describe, expect, it } from "vitest";
import {
  evaluateScopeApproval,
  scopeFingerprint,
  validateScope,
  type ScopeValidationItem,
} from "@/domains/scopeValidation";
import {
  displayLaborExtension,
  laborExtension,
  normalizeLaborRate,
} from "@/domains/estimating/laborRounding";
import { normalizeTradeKey, suggestTradeFromText } from "@/domains/estimating/tradeTaxonomy";
import { conciseTaskLabel } from "@/domains/estimating/taskNaming";

/** Master Suite Garage Conversion — the fixture the failures were observed on. */
function garageScope(): ScopeValidationItem[] {
  return [
    { id: "1", title: "Frame 16x18 platform", tradeKey: "framing" },
    { id: "2", title: "Frame 16 x 18 platform", tradeKey: "framing" },
    { id: "3", title: "Install shower tile", tradeKey: "framing" },
    { id: "4", title: "Remove existing partition wall", tradeKey: "framing" },
    { id: "5", title: "Install kitchen cabinets and range", tradeKey: "finish_carpentry" },
    { id: "6", title: "Install LVL beam and posts", tradeKey: "framing", laborHours: 0, isLaborBearing: true },
    { id: "7", title: "Insulate walls", tradeKey: "insulation", laborHours: 0.1, isLaborBearing: true },
  ];
}

const kinds = (items: ScopeValidationItem[], ctx = {}) =>
  validateScope(items, ctx).findings.map((f) => f.kind);

describe("scope sanity check — Master Suite Garage Conversion", () => {
  it("catches the duplicate platform framing", () => {
    expect(kinds(garageScope())).toContain("duplicate");
  });

  it("flags shower tile filed under framing and suggests tile", () => {
    const finding = validateScope(garageScope()).findings.find(
      (f) => f.kind === "suspicious_trade" && f.itemIds.includes("3"),
    );
    expect(finding?.suggestedTradeKey).toBe("tile");
  });

  it("classifies partition-wall removal as demolition", () => {
    expect(suggestTradeFromText("Remove existing partition wall")).toBe("demolition");
  });

  it("flags leftover kitchen cabinets/appliances in a garage bed/bath conversion", () => {
    const report = validateScope(garageScope(), {
      projectType: "garage conversion",
      evidenceText: "Convert the garage into a master suite bedroom and bathroom.",
    });
    expect(report.findings.some((f) => f.itemIds.includes("5"))).toBe(true);
  });

  it("blocks a labor-bearing item with zero hours", () => {
    const report = validateScope(garageScope());
    const zero = report.findings.find((f) => f.kind === "zero_hours");
    expect(zero?.severity).toBe("blocker");
    expect(evaluateScopeApproval(report).canApprove).toBe(false);
  });

  it("flags implausibly tiny hours on real construction work", () => {
    expect(kinds(garageScope())).toContain("implausible_hours");
  });

  it("does not invent hour findings before pricing exists", () => {
    const report = validateScope([{ id: "a", title: "Paint walls", tradeKey: "painting" }]);
    expect(report.findings.some((f) => f.kind === "zero_hours")).toBe(false);
  });

  it("lets the contractor clear the gate by acknowledging blockers", () => {
    const report = validateScope(garageScope());
    const decision = evaluateScopeApproval(report, {
      acknowledgedFindingIds: report.findings.map((f) => f.id),
    });
    expect(decision.canApprove).toBe(true);
    expect(decision.outstanding).toHaveLength(0);
  });

  it("re-opens the gate when scope changes after approval", () => {
    const items = garageScope();
    const before = scopeFingerprint(items);
    const after = scopeFingerprint([...items, { id: "8", title: "Install LVP flooring" }]);
    expect(after).not.toBe(before);
    const report = validateScope([...items, { id: "8", title: "Install LVP flooring" }]);
    expect(evaluateScopeApproval(report, { approvedFingerprint: before }).isStale).toBe(true);
  });
});

describe("labor rounding rules", () => {
  it("normalizes rates to the nearest $0.05", () => {
    expect(normalizeLaborRate(63.24)).toBe(63.25);
  });

  it("rounds displayed extensions up to the next whole dollar", () => {
    expect(displayLaborExtension(632.4)).toBe(633);
    expect(displayLaborExtension(632)).toBe(632);
  });

  it("keeps hours as the source quantity", () => {
    const ext = laborExtension(10, 63.24);
    expect(ext.rate).toBe(63.25);
    expect(ext.raw).toBeCloseTo(632.5, 2);
    expect(ext.display).toBe(633);
  });
});

describe("trade grouping and task naming", () => {
  it("keeps tile out of framing and flooring", () => {
    expect(normalizeTradeKey("shower tile")).toBe("tile");
  });

  it("keeps cabinets, trim and stairs in finish carpentry", () => {
    for (const label of ["Install cabinets", "Install base trim", "Build stairs"]) {
      expect(normalizeTradeKey(label)).toBe("finish_carpentry");
    }
  });

  it("makes compound task labels concise and one-action-per-line", () => {
    expect(conciseTaskLabel("Insulate walls, ceiling, floor — walls")).toBe("Insulate walls");
  });
});
