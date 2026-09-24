/**
 * UNIVERSAL BALLPARK QUESTION ISOLATION.
 *
 * Questions must be owned by the CURRENT project's admitted scope. A garage
 * conversion / LVL / plumbing job must not lend its interview to a handyman
 * punch list, and switching projects must not reuse the prior job's schema,
 * answers or cursor.
 */

import { describe, expect, it } from "vitest";
import { schemaForScope, signalsFromNarrative } from "@/domains/ballpark";

/** The live Handyman project: fascia + shadow board, ceiling insulation, one door. */
const HANDYMAN_NARRATIVE = [
  "Remove about 56 linear feet of 1x6 fascia on the front of the house.",
  "Install new shadow board and fascia to match.",
  "Install 210 square feet of ceiling insulation in the garage.",
  "Install one new interior door for attic access.",
].join("\n");

const PROJECT_A_NARRATIVE = [
  "Convert the garage into a master suite.",
  "Install a new LVL beam and two posts at the removed bearing wall.",
  "Relocate the plumbing for the new bathroom sink and toilet.",
  "Build a built-in bookcase in the living room.",
].join("\n");

const CONTAMINATED_QUESTION_IDS = [
  "lengthFt",
  "widthFt",
  "ceilingHeightFt",
  "useOfSpace",
  "bathroom",
  "closet",
  "partitions",
  "partitionLfKnown",
  "raisedFloor",
  "insulationWalls",
  "insulationFloor",
  "newWindows",
  "plumbing",
  "pipeMaterial",
  "pipeRunLf",
  "plumbingAccess",
  "fixtureCount",
  "beamSpanFt",
  "beamFinishMethod",
  "builtInLengthFt",
  "builtInMaterial",
  "finishLevel",
  "flooringQuality",
];

const handymanIds = () =>
  schemaForScope(signalsFromNarrative(HANDYMAN_NARRATIVE)).questions.map((q) => q.id);

describe("ballpark questions trace to the current project only", () => {
  it("asks the handyman punch list only what its own scope justifies", () => {
    /*
     * The narrative already states the ceiling insulation area, so asking about
     * it again is a redundant question, not isolation: only the door remains.
     */
    expect(handymanIds()).toEqual(["newDoors"]);
  });

  it("never surfaces another archetype's questions on the handyman job", () => {
    const ids = handymanIds();
    for (const contaminated of CONTAMINATED_QUESTION_IDS) {
      expect(ids).not.toContain(contaminated);
    }
  });

  it("still asks the garage / LVL / plumbing job its own questions", () => {
    const ids = schemaForScope(signalsFromNarrative(PROJECT_A_NARRATIVE)).questions.map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(["lengthFt", "widthFt", "partitions", "plumbing"]));
  });

  it("shares no schema identity or questions between project A and project B", () => {
    const a = schemaForScope(signalsFromNarrative(PROJECT_A_NARRATIVE));
    const b = schemaForScope(signalsFromNarrative(HANDYMAN_NARRATIVE));
    expect(a.key).not.toBe(b.key);
    const aIds = new Set(a.questions.map((q) => q.id));
    for (const id of b.questions.map((q) => q.id)) {
      /* Only genuinely shared, scope-owned questions may overlap. */
      if (aIds.has(id)) expect(["insulationCeiling", "newDoors"]).toContain(id);
    }
  });
});
