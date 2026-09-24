/**
 * Ballpark vs Detailed gating (Module 017 correction).
 *
 * The live Garage Conversion project must never demand "Complete pricing —
 * 24 items" to produce a range. In ballpark mode the primary action is Build /
 * Refresh Ballpark Range and the unresolved lines are optional exceptions.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EstimateDTO } from "../types";
import { mapEstimate } from "../services/mappers";

const navigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const { EstimateModeCard } = await import("../components/EstimateModeCard");

function estimate(overrides: Partial<EstimateDTO>): EstimateDTO {
  return {
    id: "est-1",
    title: "Garage Conversion",
    intakeMode: "ballpark",
    pricingMode: "total",
    pricingMethod: "overhead_profit" as const,
    targetGrossMarginPct: 0,
  laborSettings: {},
    rangeSnapshot: null,
    ...overrides,
  } as unknown as EstimateDTO;
}

describe("estimate mode status row", () => {
  it("renders the ballpark mode as status text, not a disabled button", () => {
    const { container } = render(
      <EstimateModeCard
        estimate={estimate({ intakeMode: "ballpark" })}
        projectId="p1"
        exceptions={24}
        readOnly={false}
        saving={false}
        onModeChange={() => {}}
        onPricingModeChange={() => {}}
        onReviewExceptions={() => {}}
      />,
    );
    expect(screen.getByText("Estimate Type:", { exact: false })).toBeTruthy();
    expect(screen.getByText("Ballpark")).toBeTruthy();
    /*
     * No ESTIMATE-MODE buttons in ballpark mode; the switch lives in the
     * ballpark card's single More options menu. The pricing-mode selector is a
     * separate sell/presentation control and is expected here.
     */
    const modeButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => !b.closest("[data-testid='pricing-mode-selector']"),
    );
    expect(modeButtons.length).toBe(0);
    expect(screen.queryByText("Build Ballpark Range")).toBeNull();
    expect(screen.queryByText("Review exceptions (24)")).toBeNull();
  });

  it("detailed mode exposes switching through More options only", () => {
    const { container } = render(
      <EstimateModeCard
        estimate={estimate({ intakeMode: "detailed" })}
        projectId="p1"
        exceptions={24}
        readOnly={false}
        saving={false}
        onModeChange={() => {}}
        onPricingModeChange={() => {}}
        onReviewExceptions={() => {}}
      />,
    );
    expect(screen.getByText("Detailed")).toBeTruthy();
    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (b) => !b.closest("[data-testid='pricing-mode-selector']"),
    );
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.textContent).toContain("More options");
    expect(buttons.some((b) => b.hasAttribute("disabled"))).toBe(false);
  });

  it("read-only estimates show status text with no actions", () => {
    const { container } = render(
      <EstimateModeCard
        estimate={estimate({ intakeMode: "detailed" })}
        projectId="p1"
        exceptions={0}
        readOnly
        saving={false}
        onModeChange={() => {}}
        onPricingModeChange={() => {}}
        onReviewExceptions={() => {}}
      />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
  });

  it("legacy rows without a mode stay detailed", () => {
    expect(mapEstimate({ id: "e", created_by: "u" }).intakeMode).toBe("detailed");
    expect(mapEstimate({ id: "e", created_by: "u", intake_mode: "ballpark" }).intakeMode).toBe(
      "ballpark",
    );
  });
});
