/**
 * STRICT BALLPARK vs DETAILED SEPARATION.
 *
 * A ballpark is COMPLETE when it has a credible range built from evidence plus
 * disclosed assumptions. It must never ask the contractor to confirm, approve
 * or improve measurements before the range counts. Exact takeoff dimensions,
 * quantity verification and trade-specific questions belong exclusively to the
 * Detailed estimate.
 *
 * Reproduces the garage-conversion report: a ballpark whose measurements are
 * inferred/unconfirmed rendered yellow "pricing needs review" / measurement
 * review presentation next to an otherwise credible range.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnresolvedLinesPanel } from "@/features/estimating/components/UnresolvedLinesPanel";
import type { ResolutionSummary } from "@/domains/estimating/resolution";

const estimateTab = readFileSync(
  "src/features/estimating/components/EstimateTab.tsx",
  "utf8",
);
const ballparkCard = readFileSync(
  "src/features/estimating/components/BallparkRangeCard.tsx",
  "utf8",
);

describe("Ballpark surfaces carry no measurement/refinement demand", () => {
  it("never renders the measurement (geometry) panel in ballpark mode", () => {
    /* The Measurements dialog lives inside GeometryQuantitiesPanel. */
    expect(estimateTab).toMatch(
      /\{!isBallpark \? \(\s*<section data-testid="est-geometry">/,
    );
    expect(estimateTab).not.toMatch(/isBallpark \|\| integrity\.isIncomplete/);
  });

  it("suppresses the pricing-confirmation warning in ballpark mode", () => {
    expect(estimateTab).toMatch(/required=\{!isBallpark && active\.pricingConfirmationRequired\}/);
  });

  it("suppresses the unresolved-line callout and its measure CTA in ballpark", () => {
    expect(estimateTab).toMatch(/hideUnresolved=\{isBallpark\}/);
  });

  it("shows no yellow review or incomplete banner on the ballpark card", () => {
    expect(ballparkCard).not.toContain('data-testid="ballpark-needs-review"');
    expect(ballparkCard).not.toContain('data-testid="ballpark-incomplete"');
    expect(ballparkCard).not.toMatch(/bg-warning/);
  });

  it("offers no Improve Accuracy or refinement-interview CTA", () => {
    expect(ballparkCard).not.toContain('data-testid="ballpark-interview-action"');
    expect(ballparkCard).not.toMatch(/improveAccuracy/i);
    expect(ballparkCard).not.toMatch(/goToBallpark\("interview"\)/);
  });

  it("still presents the ballpark as complete with its assumptions disclosed", () => {
    expect(ballparkCard).toContain('data-testid="ballpark-complete"');
    expect(ballparkCard).toContain('data-testid="ballpark-assumptions"');
  });
});

describe("Detailed estimate keeps the takeoff review workflow", () => {
  it("renders the measurement panel and integrity banner once converted", () => {
    expect(estimateTab).toContain("<GeometryQuantitiesPanel");
    expect(estimateTab).toMatch(/const pricingIncomplete = !isBallpark && integrity\.isIncomplete/);
    expect(estimateTab).toContain("<IncompletePricingBanner");
  });
});

const summary = (): ResolutionSummary =>
  ({
    total: 2,
    unresolved: 1,
    assumedDefault: 1,
    measured: 0,
    lines: [
      {
        id: "l1",
        description: "Drywall repair",
        unitKey: "sf",
        reason: "missing_quantity",
        laborHoursPerUnit: 0,
      },
    ],
    assumedLines: [
      { id: "l2", description: "Transitions and thresholds", quantity: 1, unitKey: "ea" },
    ],
  }) as unknown as ResolutionSummary;

describe("UnresolvedLinesPanel", () => {
  it("hides the unresolved callout but keeps assumption disclosure in ballpark", () => {
    render(<UnresolvedLinesPanel summary={summary()} hideUnresolved readOnly />);
    expect(screen.queryByTestId("estimate-unresolved-lines")).toBeNull();
    expect(screen.getByTestId("estimate-assumed-quantity-lines")).toBeTruthy();
  });

  it("shows the unresolved callout in detailed mode", () => {
    render(<UnresolvedLinesPanel summary={summary()} readOnly />);
    expect(screen.getByTestId("estimate-unresolved-lines")).toBeTruthy();
  });
});
