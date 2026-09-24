import { describe, expect, it } from "vitest";
import {
  applyTerminologyMemory,
  findTerminologyCorrection,
  inferCorrectionContext,
  validateProposedCorrection,
  type TerminologyCorrection,
} from "@/domains/terminologyMemory";

const base: TerminologyCorrection = {
  id: "c1",
  wrongTerm: "baseboard and casing trim",
  correctedTerm: "vinyl trim around the deck edge",
  triggerPhrase: "vinyl trim",
  contextScope: "exterior",
  tradeKey: null,
  captureMethod: "scope_text_edit",
  isActive: true,
};

describe("terminology correction memory", () => {
  it("applies the contractor's correction inside a longer scope sentence", () => {
    const { term, match } = applyTerminologyMemory([base], {
      candidateTerm: "Install baseboard and casing trim (approximately 48 linear feet)",
      narration: "white vinyl trim around the deck edge",
      context: "exterior",
    });
    expect(term).toContain("vinyl trim around the deck edge");
    expect(term).not.toContain("baseboard");
    expect(match?.reason).toContain("saved correction");
  });

  it("does not leak an exterior correction into interior work", () => {
    expect(
      findTerminologyCorrection([base], {
        candidateTerm: "Install baseboard and casing trim",
        narration: "vinyl trim",
        context: "interior",
      }),
    ).toBeNull();
  });

  it("requires the trigger phrase in this project's own narration", () => {
    expect(
      findTerminologyCorrection([base], {
        candidateTerm: "Install baseboard and casing trim",
        narration: "paint the hallway baseboard",
        context: "exterior",
      }),
    ).toBeNull();
  });

  it("respects a trade restriction", () => {
    const scoped = { ...base, id: "c2", tradeKey: "siding" };
    expect(
      findTerminologyCorrection([scoped], {
        candidateTerm: "baseboard and casing trim",
        narration: "vinyl trim",
        context: "exterior",
        tradeKey: "painting",
      }),
    ).toBeNull();
    expect(
      findTerminologyCorrection([scoped], {
        candidateTerm: "baseboard and casing trim",
        narration: "vinyl trim",
        context: "exterior",
        tradeKey: "siding",
      }),
    ).not.toBeNull();
  });

  it("prefers the most specific correction, not the newest", () => {
    const broad: TerminologyCorrection = {
      ...base,
      id: "broad",
      correctedTerm: "exterior trim",
      triggerPhrase: null,
      contextScope: "any",
    };
    const hit = findTerminologyCorrection([broad, base], {
      candidateTerm: "baseboard and casing trim",
      narration: "vinyl trim",
      context: "exterior",
    });
    expect(hit?.correction.id).toBe("c1");
  });

  it("ignores deactivated corrections and never invents wording", () => {
    const off = { ...base, isActive: false };
    const { term, match } = applyTerminologyMemory([off], {
      candidateTerm: "Install baseboard and casing trim",
      narration: "vinyl trim",
      context: "exterior",
    });
    expect(match).toBeNull();
    expect(term).toBe("Install baseboard and casing trim");
  });

  it("refuses nonsense rules", () => {
    expect(validateProposedCorrection({ wrongTerm: "ab", correctedTerm: "trim" }).ok).toBe(false);
    expect(validateProposedCorrection({ wrongTerm: "trim", correctedTerm: "trim" }).ok).toBe(false);
    expect(
      validateProposedCorrection({ wrongTerm: "vinyl trim", correctedTerm: "white vinyl trim" }).ok,
    ).toBe(false);
    expect(
      validateProposedCorrection({
        wrongTerm: "baseboard and casing trim",
        correctedTerm: "vinyl trim",
      }).ok,
    ).toBe(true);
  });

  it("infers the envelope context from wording", () => {
    expect(inferCorrectionContext("vinyl trim around the deck edge")).toBe("exterior");
    expect(inferCorrectionContext("baseboard in the bedroom closet")).toBe("interior");
    expect(inferCorrectionContext("trim")).toBe("any");
  });
});
