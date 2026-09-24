import { describe, expect, it } from "vitest";
import { extractZones, recognizeWork } from "@/domains/workRecognition";

/**
 * A rebuild narration must produce the deck body itself.
 *
 * "Demo the old deck ... rebuild it in the same spot. Another 10 by 14 deck"
 * previously recognized only railing and trim: "rebuild" was not a
 * constructive verb, and "another" split the one deck into two zones.
 */
const NARRATION = [
  "Okay, what we're doing here is we're demoing the old deck.",
  "It's a 10 by 14 deck, and we're going to rebuild it in the same spot.",
  "Another 10 by 14 deck with composite decking, vinyl railings, vinyl trim.",
  "Again, it's a 10 by 14 rebuild of a deck in the same spot.",
].join(" ");

describe("deck rebuild recognition", () => {
  it("reads the rebuilt deck as one 140 SF deck", () => {
    const zones = extractZones(NARRATION);
    expect(zones).toHaveLength(1);
    expect(zones[0]?.areaSf).toBe(140);

    const work = recognizeWork({ text: NARRATION });
    const surface = work.items.find((i) => i.workTypeKey === "deck.surface");
    expect(surface?.quantity).toBe(140);
    const railing = work.items.find((i) => i.workTypeKey === "deck.railing");
    expect(railing?.quantity).toBe(48);
  });

  it("still keeps a genuinely additional deck separate", () => {
    const zones = extractZones("Rebuild the 14x16 deck and build another 14x16 deck out back.");
    expect(zones).toHaveLength(2);
  });
});
