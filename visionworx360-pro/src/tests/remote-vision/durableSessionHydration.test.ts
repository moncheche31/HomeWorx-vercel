import { describe, expect, it } from "vitest";
import { planDurableHydration, type DurableProjectScopeState } from "@/domains/remoteVision";
import type { RemoteVisionSession } from "@/domains/remoteVision";

function blankSession(): RemoteVisionSession {
  return {
    projectId: "p1",
    projectName: "Kitchen Cabinet Ads",
    description: "",
    media: [],
    voiceTranscript: "",
    typedNotes: "",
    dimensions: [],
    assumptionOverrides: {},
    answers: {},
    editedNarrative: null,
    approvedNarrative: null,
    approvedAt: null,
    selectedLevel: "mid_range",
    removedFeatureKeys: [],
    updatedAt: "2026-08-26T12:00:00.000Z",
  };
}

const durable: DurableProjectScopeState = {
  descriptionText: "Replace the 94 inch upper cabinet bank and refinish the base run.",
  approvedText: "Scope of work: replace upper cabinet bank...",
  approvedAt: "2026-08-20T10:00:00.000Z",
  editedText: "Scope of work: replace upper cabinet bank...",
};

describe("durable hydration into the photo/video flow", () => {
  it("hydrates an existing project opened fresh with no local session (Michael's case)", () => {
    const patch = planDurableHydration(blankSession(), durable);
    expect(patch).toEqual({
      description: durable.descriptionText,
      editedNarrative: durable.approvedText,
      approvedAt: durable.approvedAt,
      approvedNarrative: durable.approvedText,
    });
  });

  it("never overwrites in-progress local session work", () => {
    const session = {
      ...blankSession(),
      description: "Contractor typed this here a minute ago",
      editedNarrative: "Locally reworded scope",
      approvedAt: "2026-08-26T11:00:00.000Z",
      approvedNarrative: "Locally approved scope",
    };
    expect(planDurableHydration(session, durable)).toBeNull();
  });

  it("fills only the blank fields", () => {
    const session = { ...blankSession(), description: "Local intake text" };
    expect(planDurableHydration(session, durable)).toEqual({
      editedNarrative: durable.approvedText,
      approvedAt: durable.approvedAt,
      approvedNarrative: durable.approvedText,
    });
  });

  it("falls back to unapproved edited wording without stamping an approval", () => {
    const patch = planDurableHydration(blankSession(), {
      descriptionText: "Paint the hallway",
      approvedText: null,
      approvedAt: null,
      editedText: "Draft scope wording",
    });
    expect(patch).toEqual({
      description: "Paint the hallway",
      editedNarrative: "Draft scope wording",
    });
  });

  it("does nothing for a genuinely blank project", () => {
    expect(
      planDurableHydration(blankSession(), {
        descriptionText: "",
        approvedText: null,
        approvedAt: null,
        editedText: null,
      }),
    ).toBeNull();
  });
});
