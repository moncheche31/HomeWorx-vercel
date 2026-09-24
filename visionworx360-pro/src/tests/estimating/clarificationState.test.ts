import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en-US/narrative.json";
import es from "@/i18n/locales/es-US/narrative.json";
import enEstimating from "@/i18n/locales/en-US/estimating.json";
import esEstimating from "@/i18n/locales/es-US/estimating.json";
import {
  clarificationLabel,
  countAnsweredEntries,
  deriveClarificationState,
} from "@/domains/estimating/clarificationState";
import { answeredQuestions, detectQuestions } from "@/domains/narrativeScope";

const scopeKeys = {
  unstarted: "actions.questions",
  completed: "actions.questionsReview",
  fresh: "actions.questionsNew",
};

describe("clarification CTA state", () => {
  it("is first-time before any answers", () => {
    const state = deriveClarificationState({ answeredCount: 0, openCount: 3 });
    expect(state.status).toBe("unstarted");
    expect(state.completed).toBe(false);
    expect(clarificationLabel(state, scopeKeys).key).toBe("actions.questions");
  });

  it("becomes review/revise once every question is answered", () => {
    const state = deriveClarificationState({ answeredCount: 4, openCount: 0 });
    expect(state.status).toBe("completed");
    expect(clarificationLabel(state, scopeKeys).key).toBe("actions.questionsReview");
  });

  it("shows only genuinely new questions as new", () => {
    const state = deriveClarificationState({ answeredCount: 4, openCount: 2 });
    expect(state.status).toBe("new");
    const label = clarificationLabel(state, scopeKeys);
    expect(label.key).toBe("actions.questionsNew");
    expect(label.count).toBe(2);
  });

  it("stays completed after an iterative revision", () => {
    const revised = deriveClarificationState({ answeredCount: 6, openCount: 0 });
    expect(revised.status).toBe("completed");
    expect(clarificationLabel(revised, scopeKeys).key).toBe("actions.questionsReview");
  });

  it("does not revert on refresh: state comes from persisted answers only", () => {
    const persisted = { "topic:finish_level": "Standard" };
    // A remount recomputes from the same persisted record.
    const first = deriveClarificationState({
      answeredCount: countAnsweredEntries(persisted),
      openCount: 0,
    });
    const afterRefresh = deriveClarificationState({
      answeredCount: countAnsweredEntries(persisted),
      openCount: 0,
    });
    expect(first).toEqual(afterRefresh);
    expect(afterRefresh.status).toBe("completed");
  });

  it("counts ballpark-style answer records and ignores blanks/skips", () => {
    expect(
      countAnsweredEntries({
        a: { status: "answered", value: 12 },
        b: { status: "skipped", value: null },
        c: "  ",
        d: "Standard",
      }),
    ).toBe(2);
    expect(countAnsweredEntries(null)).toBe(0);
  });
});

describe("narrative answered questions restore", () => {
  const items = [
    {
      id: "i1",
      title: "Convert garage to a bedroom",
      actionKey: "install",
      quantity: 1,
      unitKey: "ea",
      materialSelection: null,
      customerNotes: null,
      roomId: null,
      sectionId: "s1",
      isIncluded: true,
      isClientVisible: true,
      confidenceStatus: "customer_decision_required",
      sortOrder: 0,
    },
  ] as never;

  it("re-presents prior answers instead of an empty panel", () => {
    const answers = { "decision:i1": "Customer chose to frame the opening" };
    const open = detectQuestions({ items, answers, narrativeText: "", projectName: "Garage" });
    const prior = answeredQuestions({ items, answers, narrativeText: "", projectName: "Garage" });
    expect(open.some((q) => q.id === "decision:i1")).toBe(false);
    expect(prior.map((q) => q.id)).toContain("decision:i1");
  });

  it("returns nothing before any answer exists", () => {
    expect(answeredQuestions({ items, answers: {}, narrativeText: "", projectName: "G" })).toEqual(
      [],
    );
  });
});

describe("EN/ES parity for state-aware CTAs", () => {
  it("scope labels exist in both languages", () => {
    for (const bundle of [en, es]) {
      const actions = (bundle as unknown as { actions: Record<string, string> }).actions;
      const questions = (bundle as unknown as { questions: Record<string, string> }).questions;
      expect(actions["questions"]).toBeTruthy();
      expect(actions["questionsNew"]).toContain("{{count}}");
      expect(actions["questionsReview"]).toBeTruthy();
      expect(questions["reviewTitle"]).toBeTruthy();
      expect(questions["reviewHint"]).toBeTruthy();
      expect(questions["answeredTitle"]).toBeTruthy();
      expect(questions["newTitle"]).toContain("{{count}}");
    }
  });

  it("ballpark labels exist in both languages", () => {
    for (const bundle of [enEstimating, esEstimating]) {
      const card = (bundle as unknown as { ballparkCard: Record<string, string> }).ballparkCard;
      expect(card["editAssumptions"]).toBeTruthy();
      expect(card["reviewAssumptions"]).toBeTruthy();
      expect(card["reviewInterview"]).toBeTruthy();
      expect(card["fullInterview"]).toBeTruthy();
      expect(card["newQuestions"]).toContain("{{count}}");
    }
  });
});
