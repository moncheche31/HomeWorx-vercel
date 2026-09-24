import { describe, it, expect } from "vitest";
import { hasWorkIntent, scrubNonWorkPhrases } from "../taxonomy";

/**
 * These cases are deliberately spread across trades: the rule under test is a
 * grammar rule, so a fix that only knows about "mid grade" is a failed fix.
 */
describe("qualifier grammar", () => {
  it.each([
    ["mid grade cabinets", "grade"],
    ["builder grade fixtures", "grade"],
    ["premium tier finishes", "tier"],
    ["countertop level finish on the drywall", "level"],
    ["outlets at counter height", "height"],
    ["standard quality paint", "quality"],
  ])("strips the qualifier use in %s", (phrase, qualifier) => {
    expect(scrubNonWorkPhrases(phrase)).not.toContain(qualifier);
  });

  it("keeps real work wording intact", () => {
    for (const phrase of [
      "install hardwood flooring",
      "grade the driveway",
      "replace the countertop",
      "frame interior walls",
    ]) {
      expect(scrubNonWorkPhrases(phrase).length).toBeGreaterThan(0);
    }
  });
});

describe("work intent", () => {
  it("requires an action verb before prose can open a trade", () => {
    expect(hasWorkIntent("mid grade materials throughout")).toBe(false);
    expect(hasWorkIntent("nice countertops in the photo")).toBe(false);
  });

  it.each([
    "install new countertops",
    "replace the roof shingles",
    "grade the lot before the pour",
    "paint all bedrooms",
    "wire GFCI receptacles in the garage",
  ])("recognizes work intent in %s", (phrase) => {
    expect(hasWorkIntent(phrase)).toBe(true);
  });
});
