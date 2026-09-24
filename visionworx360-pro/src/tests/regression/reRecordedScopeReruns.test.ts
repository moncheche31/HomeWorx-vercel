import { describe, expect, it } from "vitest";
import { planDurableHydration, planReCaptureAdoption } from "@/domains/remoteVision";
import type { RemoteVisionSession } from "@/domains/remoteVision";

/**
 * "Judy's deck": the contractor re-recorded the narration on the Voice Capture
 * screen (which writes `project_notes` only). The Remote Vision session kept
 * the OLD text forever — hydration was fill-the-blanks and ran once per
 * project — so no re-analysis happened and `project_narrative_scopes` was
 * never updated. Re-running a fix was impossible to verify.
 */
const OLD = "We're rebuilding the 10x14 deck.";
const NEW = "We're demoing the old deck and rebuilding a 10x14 deck with composite decking.";

function session(patch: Partial<RemoteVisionSession> = {}): RemoteVisionSession {
  return {
    projectId: "p1",
    projectName: "",
    description: OLD,
    media: [],
    voiceTranscript: "",
    typedNotes: "",
    dimensions: [],
    assumptionOverrides: {},
    answers: {},
    editedNarrative: "Old scope wording.",
    approvedNarrative: "Old scope wording.",
    approvedAt: "2026-08-27T20:46:04.000Z",
    selectedLevel: "mid_range",
    removedFeatureKeys: [],
    updatedAt: "2026-08-27T20:46:04.000Z",
    ...patch,
  } as RemoteVisionSession;
}

describe("re-recorded narration re-runs the analysis", () => {
  it("fill-the-blanks hydration alone cannot see the new recording", () => {
    expect(
      planDurableHydration(session(), {
        descriptionText: NEW,
        approvedText: "Old scope wording.",
        approvedAt: "2026-08-27T20:46:04.000Z",
        editedText: "Old scope wording.",
      }),
    ).toBeNull();
  });

  it("adopts newly saved narration and clears stale wording/approval", () => {
    const patch = planReCaptureAdoption(session(), {
      previousDurableText: OLD,
      descriptionText: NEW,
    });
    expect(patch).toEqual({
      description: NEW,
      editedNarrative: null,
      approvedNarrative: null,
      approvedAt: null,
    });
  });

  it("never clobbers a local edit that has not been saved yet", () => {
    expect(
      planReCaptureAdoption(session({ description: "locally typed scope" }), {
        previousDurableText: OLD,
        descriptionText: OLD,
      }),
    ).toBeNull();
  });

  it("is idempotent once adopted", () => {
    expect(
      planReCaptureAdoption(session({ description: NEW }), {
        previousDurableText: OLD,
        descriptionText: NEW,
      }),
    ).toBeNull();
  });
});
