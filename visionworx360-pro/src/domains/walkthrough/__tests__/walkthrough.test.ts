import { describe, expect, it } from "vitest";
import {
  applyAnswers,
  buildQuestions,
  canAdvance,
  draftDedupeKey,
  filterUncommitted,
  nextStep,
  previousStep,
  stepProgress,
  unresolvedQuestions,
  type WalkthroughContext,
} from "../index";
import type { VoiceDraftItem } from "@/domains/voiceCapture";

function ctx(partial: Partial<WalkthroughContext> = {}): WalkthroughContext {
  return {
    hasProject: false,
    hasRoom: false,
    hasEvidence: false,
    hasTranscript: false,
    questionCount: 0,
    draftCount: 0,
    ...partial,
  };
}

function draft(partial: Partial<VoiceDraftItem> = {}): VoiceDraftItem {
  return {
    id: "d1",
    sourceText: "install new vanity",
    utteranceIndex: 0,
    title: "Install new vanity",
    actionKey: "install",
    quantity: 1,
    unitKey: "each",
    measurements: [],
    roomId: "room-1",
    roomName: "Bathroom",
    tradeKey: null,
    categoryKey: null,
    subcategoryKey: null,
    origin: "knowledge_base",
    assemblyKey: "asm-1",
    matches: [],
    needsReview: false,
    confidence: "high",
    reasonKeys: [],
    status: "pending",
    selected: true,
    ...partial,
  };
}

describe("guided walkthrough state machine", () => {
  it("blocks advancing until the step requirement is met", () => {
    expect(canAdvance("project", ctx())).toBe(false);
    expect(canAdvance("project", ctx({ hasProject: true }))).toBe(true);
    expect(canAdvance("room", ctx({ hasProject: true }))).toBe(false);
    expect(canAdvance("capture", ctx({ hasTranscript: true }))).toBe(true);
  });

  it("walks project → intake → room → capture → questions → review → summary", () => {
    const full = ctx({
      hasProject: true,
      hasRoom: true,
      hasTranscript: true,
      questionCount: 2,
      draftCount: 3,
    });
    expect(nextStep("project", full)).toBe("intake");
    expect(nextStep("room", full)).toBe("capture");
    expect(nextStep("capture", full)).toBe("questions");
    expect(nextStep("questions", full)).toBe("review");
    expect(nextStep("review", full)).toBe("summary");
  });

  it("skips the question step when nothing is uncertain", () => {
    const c = ctx({ hasProject: true, hasRoom: true, hasTranscript: true, draftCount: 1 });
    expect(nextStep("capture", c)).toBe("review");
    expect(previousStep("review", c)).toBe("capture");
  });

  it("supports room switching by returning to the room step", () => {
    expect(previousStep("capture", ctx())).toBe("room");
    expect(previousStep("room", ctx())).toBe("intake");
    expect(stepProgress("capture")).toEqual({ current: 4, total: 7 });
  });
});

describe("duplicate prevention", () => {
  it("builds a stable room + title key", () => {
    expect(draftDedupeKey(draft({ title: "  Install   New Vanity " }))).toBe(
      "room-1::install new vanity",
    );
  });

  it("drops already-committed drafts and in-batch duplicates", () => {
    const a = draft({ id: "a" });
    const b = draft({ id: "b" });
    const c = draft({ id: "c", title: "Replace faucet" });
    expect(filterUncommitted([a, b, c], []).map((d) => d.id)).toEqual(["a", "c"]);
    expect(filterUncommitted([a, c], [draftDedupeKey(a)]).map((d) => d.id)).toEqual(["c"]);
  });
});

describe("missing-information questions", () => {
  it("asks nothing when smart defaults resolved everything", () => {
    const resolved = draft({ sourceText: "paint the ceiling", title: "Paint ceiling" });
    expect(buildQuestions([resolved], { rooms: [{ id: "room-1", name: "Bathroom" }] })).toEqual([]);
  });

  it("asks quantity when it is unknown", () => {
    const questions = buildQuestions([draft({ quantity: null })]);
    expect(questions.some((q) => q.kind === "quantity")).toBe(true);
  });

  it("asks which match when the lexical match was ambiguous", () => {
    const questions = buildQuestions([
      draft({
        assemblyKey: null,
        matches: [
          {
            assemblyKey: "a",
            workItem: "Vanity 48in",
            tradeKey: null,
            categoryKey: null,
            subcategoryKey: null,
            unitKey: "each",
            score: 0.5,
          },
          {
            assemblyKey: "b",
            workItem: "Vanity 36in",
            tradeKey: null,
            categoryKey: null,
            subcategoryKey: null,
            unitKey: "each",
            score: 0.48,
          },
        ],
      }),
    ]);
    expect(questions.some((q) => q.kind === "match")).toBe(true);
  });

  it("tracks unresolved questions and applies answers to drafts", () => {
    const d = draft({ quantity: null });
    const questions = buildQuestions([d]);
    const q = questions.find((x) => x.kind === "quantity")!;
    expect(unresolvedQuestions(questions, {})).toHaveLength(questions.length);

    const answered = applyAnswers([d], [q], { [q.id]: { status: "answered", value: 3 } });
    expect(answered[0].quantity).toBe(3);

    const skipped = applyAnswers([d], [q], { [q.id]: { status: "skipped" } });
    expect(skipped[0].quantity).toBeNull();
    expect(
      unresolvedQuestions(questions, { [q.id]: { status: "answered", value: 3 } }).length,
    ).toBe(questions.length - 1);
  });
});
