/**
 * Scope review: the contractor's trade authority.
 *
 * The AI may suggest a trade, but the contractor must be able to keep the
 * current one, accept the suggestion, or pick ANY canonical trade from the
 * shared taxonomy (LABOR_TRADES) — through the same assignment path.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LABOR_TRADES } from "@/domains/estimating/tradeTaxonomy";

const updateItem = { mutateAsync: vi.fn().mockResolvedValue({}) };
const bulkInclusion = { mutateAsync: vi.fn().mockResolvedValue({}) };

vi.mock("@/features/scope/hooks/useScope", () => ({
  useScopeMutations: () => ({ updateItem, bulkInclusion }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && typeof opts["trade"] === "string" ? `${key}:${opts["trade"]}` : key,
  }),
}));

const { ScopeValidationPanel } = await import(
  "@/features/scope/components/ScopeValidationPanel"
);

const item = {
  id: "item-1",
  sectionId: "sec-1",
  roomId: null,
  title: "Prime and paint trim",
  scopeItemKey: null,
  tradeKey: "general_conditions",
  categoryKey: null,
  subcategoryKey: null,
  actionKey: "paint",
  description: null,
  quantity: 1,
  unitKey: "each",
  materialSelection: null,
  finishSelection: null,
  laborNotes: null,
  customerNotes: null,
  internalNotes: null,
  assumptions: null,
  exclusions: null,
  isIncluded: true,
  isCustomerSelection: false,
  isClientVisible: true,
  priority: "normal",
  confidenceStatus: "assumed",
  completionStatus: "draft",
} as any;

const onDecide = vi.fn().mockResolvedValue(undefined);

const finding = {
  id: "f-1",
  subjectKey: "suspicious_trade:item-1",
  subjectFingerprint: "fp-1",
  kind: "suspicious_trade",
  severity: "warning",
  itemIds: ["item-1"],
  suggestedTradeKey: "finish_carpentry",
  params: {},
} as any;

function renderPanel() {
  return render(
    <ScopeValidationPanel
      projectId="p-1"
      items={[item]}
      findings={[finding]}
      decidedSubjectKeys={[]}
      onDecide={onDecide}
      onDecideAll={vi.fn()}
    />,
  );
}

describe("scope trade reassignment", () => {
  beforeEach(() => {
    updateItem.mutateAsync.mockClear();
    onDecide.mockClear();
  });

  it("renders the keep action as a solid, tappable control that wraps", () => {
    renderPanel();
    const keep = screen.getByTestId("scope-finding-keep-f-1");
    expect(keep.className).toContain("border");
    expect(keep.className).toContain("min-h-11");
    expect(keep.className).toContain("whitespace-normal");
    expect(keep.textContent).toContain("validation.actions.keepTrade");
  });

  it("offers keep, suggested move, and a third choose-different-trade action", () => {
    renderPanel();
    expect(screen.getByTestId("scope-finding-fix-f-1").textContent).toContain(
      "validation.actions.fixTrade:validation.trades.finish_carpentry",
    );
    expect(screen.getByTestId("scope-finding-other-trade-f-1")).toBeTruthy();
  });

  it("opens an accessible picker listing the canonical trade taxonomy", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("scope-finding-other-trade-f-1"));
    await waitFor(() => screen.getByTestId("scope-trade-picker"));
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    for (const trade of LABOR_TRADES) {
      expect(screen.getByTestId(`scope-trade-option-${trade}`)).toBeTruthy();
    }
  });

  it("saves Painting through the same update path when the suggestion was Finish Carpentry", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("scope-finding-other-trade-f-1"));
    await waitFor(() => screen.getByTestId("scope-trade-picker"));
    fireEvent.click(screen.getByTestId("scope-trade-option-painting"));
    await waitFor(() => expect(updateItem.mutateAsync).toHaveBeenCalledTimes(1));
    expect(updateItem.mutateAsync.mock.calls[0][0]).toMatchObject({
      id: "item-1",
      projectId: "p-1",
      tradeKey: "painting",
    });
    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith(finding, "reassigned", "painting"),
    );
  });

  it("records a durable keep decision instead of local-only state", async () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("scope-finding-keep-f-1"));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith(finding, "kept"));
  });

  it("keeps EN/ES labels in sync for the new picker copy", () => {
    const en = JSON.parse(readFileSync("src/i18n/locales/en-US/scope.json", "utf8"));
    const es = JSON.parse(readFileSync("src/i18n/locales/es-US/scope.json", "utf8"));
    for (const key of ["chooseTrade", "chooseTradeTitle", "chooseTradeHint", "suggested", "currentTrade"]) {
      expect(en.validation.actions[key]).toBeTruthy();
      expect(es.validation.actions[key]).toBeTruthy();
    }
  });
});
