/**
 * MULTIMODAL EVIDENCE GATE (Phase 3).
 *
 * Photos, video and spoken narration all feed ONE current-project
 * understanding, but they do not carry equal authority:
 *
 *  - spoken narration is an instruction, exactly like the written narrative
 *    (still gated on action + object);
 *  - a visual observation is CONTEXT. Seeing a lawn, a driveway or a panel
 *    never opens landscaping, sitework or electrical scope, and therefore can
 *    never produce a question, a measurement field or a priced quantity.
 *
 * This is the regression that keeps a built-in-bookcase project from being
 * asked about landscaping debris because the photo happened to include a yard.
 */

import { describe, expect, it } from "vitest";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark/questions";
import { buildCurrentProjectScopeContext } from "../context";
import { classifyWorkDomains } from "../taxonomy";

const YARD_OBSERVATIONS = [
  "Existing lawn and shrubs visible along the driveway",
  "Concrete driveway and site grading beyond the window",
  "Mulch bed with trees near the walkway",
];

describe("visual observations are context, never scope", () => {
  it("classifies observation-only domains as weak and never corroborated", () => {
    const evidence = classifyWorkDomains(
      YARD_OBSERVATIONS.map((title) => ({ title, source: "visual_observation" as const })),
    );
    for (const entry of evidence) {
      expect(entry.stated).toBe(false);
      expect(entry.strength).toBe("weak");
    }
  });

  it("gives a media-only project the broad clarifier, not another trade's interview", () => {
    const context = buildCurrentProjectScopeContext(
      { projectId: "p1", visualObservations: YARD_OBSERVATIONS },
      QUICK_BALLPARK_SCHEMA,
    );
    expect(context.domains).toEqual([]);
    expect(context.needsScopeClarifier).toBe(true);
    expect(context.questions.map((q) => q.id)).toEqual(["scopeClarifier"]);
    expect(context.measurementFields).toEqual([]);
  });

  it("never leaks landscaping/sitework questions into a built-in bookcase job", () => {
    const context = buildCurrentProjectScopeContext(
      {
        projectId: "p2",
        narrativeText:
          "Build built-in bookcases on the 6 foot wall. Install a 26 foot LVL beam and two columns.",
        visualObservations: YARD_OBSERVATIONS,
      },
      QUICK_BALLPARK_SCHEMA,
    );
    expect(context.domains).not.toContain("planting");
    expect(context.domains).not.toContain("sitework");
    expect(context.domains).not.toContain("excavation");
    expect(context.domains.length).toBeGreaterThan(0);
    const asked = context.questions.map((q) => q.id).join(" ").toLowerCase();
    for (const forbidden of ["plant", "tree", "debris", "haul", "sod", "irrigation", "grading"]) {
      expect(asked).not.toContain(forbidden);
    }
  });
});

describe("spoken narration is instruction-grade", () => {
  it("opens scope when the contractor states an action and an object", () => {
    const context = buildCurrentProjectScopeContext(
      {
        projectId: "p3",
        spokenNarration: "On this wall we are going to install built-in cabinets and shelving.",
      },
      QUICK_BALLPARK_SCHEMA,
    );
    expect(context.domains.length).toBeGreaterThan(0);
    expect(context.needsScopeClarifier).toBe(false);
  });

  it("does not open scope for narration that only points at existing conditions", () => {
    const context = buildCurrentProjectScopeContext(
      { projectId: "p4", spokenNarration: "Here is the old lawn, and that is the driveway." },
      QUICK_BALLPARK_SCHEMA,
    );
    expect(context.domains).not.toContain("planting");
    expect(context.domains).not.toContain("sitework");
  });
});
