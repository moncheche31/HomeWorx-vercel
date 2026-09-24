/**
 * Regression: "Improve accuracy" must refine FACTS without handing pricing
 * authority back to the intake pricer (ADR-062), and must never let a
 * clarification replace a credible band with nonsense (ADR-047).
 */

import { describe, expect, it } from "vitest";
import {
  improveAccuracyQuestionIds,
  improveAccuracySelectionAnswers,
  scopeAwareSchema,
  selectImproveAccuracyQuestions,
  visibleQuestions,
  type BallparkAnswers,
} from "@/domains/ballpark";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";
import { classifyWorkDomains } from "@/domains/workScope";

/*
 * Question relevance is scope-text aware, so the schema must be built from the
 * same words the contractor used — not from the domains alone.
 */
const schemaFor = (scope: string) =>
  scopeAwareSchema(
    undefined,
    classifyWorkDomains([{ title: scope, source: "scope_item" }]).map((e) => e.domain),
    scope,
  );


describe("improve accuracy: advertised count equals asked questions", () => {
  it("asks exactly the questions the estimate card counted", () => {
    const schema = schemaFor("Kitchen remodel with new flooring and paint");
    const answers: BallparkAnswers = {};
    const advertised = selectImproveAccuracyQuestions(schema, answers);
    const asked = improveAccuracyQuestionIds(schema, answers);
    expect(asked).toEqual(advertised.map((q) => q.id));
    /* The set is a real subset of the schema, never the whole interview. */
    expect(asked.length).toBeLessThanOrEqual(visibleQuestions(schema, answers).length);
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("shrinks as facts get answered and never grows a hidden series", () => {
    const schema = schemaFor("Bathroom remodel: tile shower, vanity, paint");
    const first = improveAccuracyQuestionIds(schema, {});
    /* A silent early return here let this ADR-062 test pass asserting nothing. */
    expect(first.length).toBeGreaterThan(0);
    const answered: BallparkAnswers = {
      [first[0]!]: { value: 12, status: "answered" } as never,
    };
    const second = improveAccuracyQuestionIds(schema, answered);
    expect(second.length).toBeLessThanOrEqual(first.length);
    expect(second).not.toContain(first[0]);
  });
});

describe("clarification cannot destroy a credible band", () => {
  const previous = { low: 34500, expected: 38500, high: 43000 };

  it("preserves the band when the clarification result is zero", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 0, expected: 0, high: 0 },
      previous,
      unresolvedCount: 0,
      contractorInitiated: true,
    });
    expect(decision).toEqual({ allow: false, reason: "zeroBand" });
  });

  it("preserves the band when the candidate is an incomplete quote", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 100, expected: 200, high: 300 },
      previous,
      unresolvedCount: 0,
      contractorInitiated: true,
      candidateIsValidQuote: false,
    });
    expect(decision).toEqual({ allow: false, reason: "invalidCandidate" });
  });

  it("contractor-initiated refinement is NOT a blanket sanity bypass", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 285500, expected: 454350, high: 650000 },
      previous,
      unresolvedCount: 0,
      contractorInitiated: true,
    });
    expect(decision).toEqual({ allow: false, reason: "divergent" });
  });

  it("allows a legitimate sharpening of the same job cost", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 36000, expected: 41000, high: 46000 },
      previous,
      unresolvedCount: 0,
      contractorInitiated: true,
    });
    expect(decision).toEqual({ allow: true });
  });

  it("an estimate with no credible saved band may still bootstrap", () => {
    expect(
      evaluateRecalcGate({
        candidate: { low: 1000, expected: 2000, high: 3000 },
        previous: null,
        unresolvedCount: 2,
      }),
    ).toEqual({ allow: true });
  });
});

describe("count parity across card and page (shared basis)", () => {
  const schema = schemaFor("Garage conversion to master suite with bathroom");

  it("card and page derive the same set from the same saved session", () => {
    const saved: BallparkAnswers = {
      roomType: { value: "garage", status: "answered" } as never,
    };
    const basisArgs = {
      savedAnswers: saved,
      savedSchemaKey: schema.key,
      schemaKey: schema.key,
      measured: { lengthFt: 22, widthFt: 20 },
      domains: classifyWorkDomains([
        { title: "Garage conversion to master suite with bathroom", source: "scope_item" },
      ]).map((e) => e.domain),
    };
    const cardBasis = improveAccuracySelectionAnswers(basisArgs);
    const pageBasis = improveAccuracySelectionAnswers(basisArgs);
    expect(pageBasis).toEqual(cardBasis);
    expect(improveAccuracyQuestionIds(schema, pageBasis)).toEqual(
      selectImproveAccuracyQuestions(schema, cardBasis).map((q) => q.id),
    );
  });

  it("answers saved under a different schema are ignored by BOTH sides", () => {
    const stale: BallparkAnswers = {
      lengthFt: { value: 22, status: "answered" } as never,
    };
    const basis = improveAccuracySelectionAnswers({
      savedAnswers: stale,
      savedSchemaKey: "some.other.schema",
      schemaKey: schema.key,
    });
    expect(basis).toEqual({});
  });

  it("answering every advertised question leaves nothing more to ask", () => {
    const advertised = improveAccuracyQuestionIds(schema, {});
    const answers: BallparkAnswers = {};
    for (const id of advertised) {
      answers[id] = { value: 10, status: "answered" } as never;
    }
    const basis = improveAccuracySelectionAnswers({
      savedAnswers: answers,
      savedSchemaKey: schema.key,
      schemaKey: schema.key,
    });
    for (const id of advertised) expect(improveAccuracyQuestionIds(schema, basis)).not.toContain(id);
  });
});

describe("canonical ownership of the saved band", () => {
  /** Mirrors the completion-path predicate in BallparkPage.handleUse. */
  const intakeMayWrite = (snapshot: { source?: string } | null, hasCanonicalLines: boolean) =>
    !(snapshot?.source === "canonical_lines" || hasCanonicalLines);

  it("an estimate with canonical lines never takes the intake band", () => {
    expect(intakeMayWrite({ source: "canonical_lines" }, true)).toBe(false);
    /* Even if the line-count probe cannot be reached, the snapshot's own
       provenance keeps the intake pricer out. */
    expect(intakeMayWrite({ source: "canonical_lines" }, false)).toBe(false);
  });

  it("a brand-new estimate with no canonical lines may still bootstrap", () => {
    expect(intakeMayWrite(null, false)).toBe(true);
    expect(intakeMayWrite({ source: "intake" }, false)).toBe(true);
  });

  it("a scope-recalc band is still protected once canonical lines exist", () => {
    expect(intakeMayWrite({ source: "scope_recalc" }, true)).toBe(false);
  });
});
