import { describe, expect, it } from "vitest";
import { WORK_RULES, ruleLabelFor, ruleScopeTitleFor, spokenSubjectFor } from "@/domains/remoteVision/lexicon";

const rule = (key: string) => {
  const found = WORK_RULES.find((r) => r.featureKey === key);
  if (!found) throw new Error(`missing rule ${key}`);
  return found;
};

describe("the contractor's own wording is the default, across trades", () => {
  it("keeps exterior trim in his words (yesterday's case still holds)", () => {
    expect(ruleScopeTitleFor(rule("trim.exterior"), "white vinyl trim around the deck edge", "en-US")).toContain(
      "vinyl trim",
    );
  });

  it("never renames interior trim into exterior vocabulary and vice versa", () => {
    const interior = rule("trim.replace");
    const title = ruleScopeTitleFor(interior, "replace the baseboard in the hallway", "en-US");
    expect(title).not.toMatch(/deck|fascia|soffit/i);
  });

  it("preserves his material wording instead of the generic catalog subject", () => {
    const flooring = rule("flooring.replace");
    const spoken = "install new hardwood flooring throughout the first floor";
    const own = spokenSubjectFor(flooring, spoken, flooring.scopeTitle["en-US"]);
    expect(own).toBe("hardwood flooring");
    expect(ruleLabelFor(flooring, spoken, "en-US")).toBe("Hardwood flooring");
  });

  it("falls back to the catalog subject when he added no wording of his own", () => {
    const flooring = rule("flooring.replace");
    expect(ruleScopeTitleFor(flooring, "replace the flooring", "en-US")).toBe(
      flooring.scopeTitle["en-US"],
    );
    expect(ruleScopeTitleFor(flooring, "", "en-US")).toBe(flooring.scopeTitle["en-US"]);
  });

  it("never lets wording carry a number into the subject", () => {
    const trim = rule("trim.exterior");
    const own = spokenSubjectFor(trim, "48 feet of vinyl trim around the deck", "exterior trim");
    expect(own == null || !/\d/.test(own)).toBe(true);
  });
});
