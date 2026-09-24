import { describe, expect, it } from "vitest";
import { analyzeDescription, collectFeatures } from "@/domains/remoteVision/analyze";
import { recognizeWork } from "@/domains/workRecognition";
import { statedCount } from "@/domains/workRecognition/recognize";

/**
 * "Judy's deck": the contractor stated 10x14 three times. The perimeter/trim
 * derivation used those dimensions correctly while the deck's OWN area fell
 * back to a generic 240 SF ballpark allowance, because a trailing bare mention
 * ("a 10x14 deck rebuild...") read "a" as a stated count of 1 and displaced the
 * actioned clause, turning the primary feature into an observation with no
 * quantity. Both halves of that failure are guarded here.
 */
const NARRATION =
  "Okay, what we're doing here is we're rebuilding the deck. We're going to demo the " +
  "existing 10x14 deck, and we're going to rebuild it in the same place. The new deck is " +
  "going to be 10x14, same size as the existing deck, but we're going to build it with, " +
  "we're going to put composite decking with a white vinyl rails and black aluminum " +
  "balusters. We're going to put white vinyl trim around the deck edge and white vinyl " +
  "lattice underneath the deck. So again, just to repeat, it's a 10x14 deck rebuild in " +
  "the exact same place that it was.";

describe("deck area derived from stated dimensions", () => {
  it("does not read a stated size as a count", () => {
    expect(statedCount("it's a 10x14 deck rebuild", /\bdeck(ing)?\b/i)).toBeNull();
    expect(statedCount("we're adding two decks", /\bdecks?\b/i)).toBe(2);
  });

  it("resolves the deck surface itself from the stated 10x14", () => {
    const work = recognizeWork({ text: NARRATION });
    const deck = work.items.find((i) => i.workTypeKey === "deck.surface");
    expect(deck).toBeDefined();
    expect(deck!.quantity).toBe(140);
    expect(deck!.unitKey).toBe("square_foot");
    expect(deck!.isAllowance).toBe(false);
    expect(
      work.observations.some((o) => o.workTypeKey === "deck.surface"),
    ).toBe(false);
  });

  it("prices the deck on 140 SF, never on a generic allowance", () => {
    const result = analyzeDescription({
      description: NARRATION,
      media: [],
      locale: "en-US",
    } as never);
    const deck = collectFeatures(result).find((f) => f.featureKey === "deck.build");
    expect(deck).toBeDefined();
    expect(deck!.quantity).toBe(140);
    expect(deck!.unitKey).toBe("square_foot");
    expect(deck!.provenance?.source).not.toBe("ballpark_allowance");
    expect(deck!.provenance?.isDefault).toBe(false);
  });
});
