import { beforeEach, describe, expect, it } from "vitest";
import {
  peekWalkthroughSession,
  readWalkthroughSession,
  walkthroughStorageKey,
} from "@/features/walkthrough/hooks/useWalkthroughSession";
import { canAdvance, nextStep, previousStep, type WalkthroughContext } from "@/domains/walkthrough";
import type { WalkthroughSessionSnapshot } from "@/domains/walkthrough";

/**
 * REGRESSION: opening a brand-new project used to restore the previously
 * walked project's step, drafts, answers and generated questions, because the
 * walkthrough session lived under one global localStorage key.
 */

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

function snapshot(projectId: string, overrides: Partial<WalkthroughSessionSnapshot> = {}) {
  return {
    version: 2 as const,
    projectId,
    projectName: projectId === PROJECT_A ? "Master Suite Garage Conversion" : "New Bathroom",
    roomId: null,
    roomName: null,
    step: "questions" as const,
    captureLanguage: "en-US" as const,
    description: "",
    transcript: "",
    drafts: [],
    answers: {},
    committedKeys: [],
    completedRooms: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

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

describe("walkthrough project isolation — storage keys", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores each project's session under its own key", () => {
    expect(walkthroughStorageKey(PROJECT_A)).toContain(PROJECT_A);
    expect(walkthroughStorageKey(PROJECT_A)).not.toBe(walkthroughStorageKey(PROJECT_B));
  });

  it("never returns project A's session for project B", () => {
    window.localStorage.setItem(
      walkthroughStorageKey(PROJECT_A),
      JSON.stringify(
        snapshot(PROJECT_A, {
          answers: { "d1:size": { status: "answered", value: 19 } },
        }),
      ),
    );

    expect(readWalkthroughSession(PROJECT_B)).toBeNull();
    expect(peekWalkthroughSession(PROJECT_B)).toBeNull();

    // Project A keeps its own completed answers intact (A → B → A).
    const back = readWalkthroughSession(PROJECT_A);
    expect(back?.projectId).toBe(PROJECT_A);
    expect(back?.answers["d1:size"]).toEqual({ status: "answered", value: 19 });
  });

  it("rejects a snapshot whose projectId does not match the key it was read from", () => {
    window.localStorage.setItem(
      walkthroughStorageKey(PROJECT_B),
      JSON.stringify(snapshot(PROJECT_A)),
    );
    expect(readWalkthroughSession(PROJECT_B)).toBeNull();
  });

  it("ignores pre-isolation global sessions for a different project", () => {
    window.localStorage.setItem(
      "vwx.walkthrough.session.v1",
      JSON.stringify({ ...snapshot(PROJECT_A), version: 1 }),
    );
    expect(readWalkthroughSession(PROJECT_B)).toBeNull();
  });

  it("returns null with no project selected", () => {
    expect(readWalkthroughSession(null)).toBeNull();
  });
});

describe("capture-first walkthrough order", () => {
  it("a brand-new project goes to capture-first intake, not questions", () => {
    expect(nextStep("project", ctx({ hasProject: true }))).toBe("intake");
    expect(previousStep("room", ctx())).toBe("intake");
  });

  it("blocks leaving intake until this project has its own evidence", () => {
    expect(canAdvance("intake", ctx({ hasProject: true }))).toBe(false);
    expect(canAdvance("intake", ctx({ hasProject: true, hasEvidence: true }))).toBe(true);
  });

  it("only asks questions when this project's analysis produced some", () => {
    const analysed = ctx({ hasProject: true, hasEvidence: true });
    expect(nextStep("intake", analysed)).toBe("room");
    expect(nextStep("intake", { ...analysed, questionCount: 3 })).toBe("questions");
  });
});
