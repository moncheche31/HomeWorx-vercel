import { describe, expect, it } from "vitest";
import { extractZones } from "@/domains/workRecognition/geometry";
import { detectRoomScaling } from "@/domains/scopeGrounding/rooms";

const DECK_JOB =
  "Demo and rebuild a 14x16 deck, composite decking, white vinyl rails. Rebuild the entire deck framing 14 by 16.";

describe("repeated mentions of one feature do not multiply its area", () => {
  it("reads 14x16 as a single 224 sq ft deck", () => {
    const zones = extractZones(DECK_JOB);
    expect(zones).toHaveLength(1);
    expect(zones[0].areaSf).toBe(224);
  });

  it("keeps genuinely distinct instances", () => {
    const zones = extractZones("Rebuild the 14x16 deck and build another 14x16 deck out back.");
    expect(zones).toHaveLength(2);
  });

  it("does not room-scale a single exterior structure", () => {
    const scaling = detectRoomScaling(DECK_JOB);
    expect(scaling.multiplier).toBe(1);
  });

  it("still scales genuine whole-house language", () => {
    const scaling = detectRoomScaling("New LVP flooring throughout the house.");
    expect(scaling.multiplier).toBeGreaterThan(1);
  });
});
