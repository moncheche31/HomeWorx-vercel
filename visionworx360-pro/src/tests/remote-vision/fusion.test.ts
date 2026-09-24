import { describe, expect, it } from "vitest";
import { analyzeDescription } from "@/domains/remoteVision/analyze";
import {
  fuseProjectUnderstanding,
  outranks,
  scopeFacts,
  visualCandidates,
} from "@/domains/remoteVision/fusion";
import {
  emptyVisualUnderstanding,
  sanitizeUnderstanding,
  type VisualUnderstandingResult,
} from "@/domains/remoteVision/visualUnderstanding";

const NARRATIVE =
  "We are going to remove the two closets, remove about six foot length of wall, " +
  "install a double LVL 26 foot beam, add two columns, and build built-in bookcases " +
  "to match the rendering. The closets are on the backside of that range hood.";

function textResult() {
  return analyzeDescription({ locale: "en-US", description: NARRATIVE, media: [] });
}

function visual(partial: Partial<VisualUnderstandingResult>): VisualUnderstandingResult {
  return {
    ...emptyVisualUnderstanding("ok", "test-model"),
    ...partial,
  };
}

describe("multimodal fusion", () => {
  it("orders authority contractor override > measurement > statement > visual", () => {
    expect(outranks("contractor_override", "confirmed_measurement")).toBe(true);
    expect(outranks("confirmed_measurement", "contractor_statement")).toBe(true);
    expect(outranks("contractor_statement", "visual_observation")).toBe(true);
    expect(outranks("visual_observation", "contractor_statement")).toBe(false);
    expect(outranks("visual_observation", "catalog_assumption")).toBe(true);
  });

  it("carries provenance on every fact", () => {
    const understanding = fuseProjectUnderstanding({ textResult: textResult() });
    expect(understanding.facts.length).toBeGreaterThan(0);
    for (const fact of understanding.facts) {
      expect(fact.provenance.authority).toBeTruthy();
      expect(fact.provenance.status).toBeTruthy();
      expect(fact.provenance.sourceType).toBeTruthy();
    }
  });

  it("reports the visual status explicitly when no media was analyzed", () => {
    const understanding = fuseProjectUnderstanding({ textResult: textResult() });
    expect(understanding.visualStatus).toBe("no_media");
  });

  it("never lets a visual observation become priced scope on its own", () => {
    const understanding = fuseProjectUnderstanding({
      textResult: textResult(),
      visual: visual({
        observations: [
          {
            subjectKey: "flooring.finish",
            object: "new wood flooring",
            nature: "design_intent",
            actionKey: "install",
            mediaIds: ["m1"],
            confidence: 0.8,
            note: "rendering shows plank flooring",
          },
        ],
      }),
    });
    const candidates = visualCandidates(understanding);
    expect(candidates.length).toBe(1);
    expect(candidates[0].isScope).toBe(false);
    expect(scopeFacts(understanding).every((f) => f.provenance.authority !== "visual_observation")).toBe(
      true,
    );
  });

  it("does not create appliance work from a range hood seen in a photo", () => {
    const understanding = fuseProjectUnderstanding({
      textResult: textResult(),
      visual: visual({
        observations: [
          {
            subjectKey: "specialty.appliance",
            object: "range hood above the cooktop",
            nature: "observed_existing",
            actionKey: null,
            mediaIds: ["m1"],
            confidence: 0.9,
            note: "existing stainless hood",
          },
        ],
      }),
    });
    expect(
      understanding.facts.filter((f) => f.featureKey === "appliances.install").length,
    ).toBe(0);
  });

  it("promotes a confirmed measurement above a re-parsed transcript number", () => {
    const understanding = fuseProjectUnderstanding({
      textResult: textResult(),
      confirmedMeasurements: [{ label: "wall", subject: "wall", inches: 72, display: "6' 0\"" }],
    });
    const measured = understanding.facts.find((f) => f.provenance.authority === "confirmed_measurement");
    expect(measured?.quantity).toBe(6);
    expect(measured?.provenance.status).toBe("confirmed");
  });
});

describe("media authority sanitization", () => {
  it("turns hidden-condition claims into warnings, never observations", () => {
    const sanitized = sanitizeUnderstanding(
      {
        observations: [
          {
            subjectKey: "demo.wall",
            object: "load-bearing wall between kitchen and dining",
            nature: "observed_existing",
            actionKey: "remove",
            mediaIds: ["p1"],
            confidence: 0.9,
            note: null,
          },
        ],
        transformations: [],
        hiddenConditionWarnings: [],
        measurementTargets: [],
      },
      { p1: "before_photo" },
    );
    expect(sanitized.observations.length).toBe(0);
    expect(sanitized.hiddenConditionWarnings[0].priceSignificant).toBe(true);
  });

  it("forces rendering-sourced observations to design intent", () => {
    const sanitized = sanitizeUnderstanding(
      {
        observations: [
          {
            subjectKey: "carpentry.builtin",
            object: "built-in bookcases flanking the opening",
            nature: "observed_existing",
            actionKey: "build",
            mediaIds: ["r1"],
            confidence: 1.4,
            note: null,
          },
        ],
        transformations: [],
        hiddenConditionWarnings: [],
        measurementTargets: [],
      },
      { r1: "after_rendering" },
    );
    expect(sanitized.observations[0].nature).toBe("design_intent");
    expect(sanitized.observations[0].confidence).toBe(1);
  });
});
