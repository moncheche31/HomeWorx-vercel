/**
 * PILOT SAFETY: the "Improve accuracy" refinement path is withdrawn from the
 * contractor-facing UI. The domain code stays (no data or engine change), but
 * no pilot surface may advertise a missing-key-details count or route into the
 * frozen clarification subset.
 *
 * Assertions are structural on the UI source, matching the pilot surface suite.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string): string => {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
};

describe("pilot UI does not expose Improve accuracy", () => {
  const CARD = "src/features/estimating/components/BallparkRangeCard.tsx";

  it("the ballpark/estimate card renders no improve-accuracy banner or CTA", () => {
    const card = source(CARD);
    expect(card).not.toMatch(/ballparkCard\.improveAccuracy/);
    expect(card).not.toMatch(/ballparkCard\.answerNow/);
  });

  it("the card advertises no open-question count badge", () => {
    const card = source(CARD);
    expect(card).not.toMatch(/selectImproveAccuracyQuestions/);
    expect(card).not.toMatch(/ballparkCard\.newQuestions/);
    /* The one clarification state it still derives reports zero open questions. */
    expect(card).toMatch(/openCount:\s*0/);
  });

  it("the ballpark page cannot enter the improve-accuracy subset flow", () => {
    const page = source("src/features/ballpark/pages/BallparkPage.tsx");
    expect(page).toMatch(/IMPROVE_ACCURACY_ENABLED\s*=\s*false/);
    expect(page).toMatch(/isImproveAccuracy = IMPROVE_ACCURACY_ENABLED/);
  });

  it("keeps the underlying domain module intact for later re-enablement", () => {
    expect(source("src/domains/ballpark/improveAccuracy.ts").length).toBeGreaterThan(0);
  });
});
