import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";
import { useProjectIntakeState } from "../hooks/useProjectIntakeState";
import { ContinueEstimateActions } from "../components/ContinueEstimateActions";

const state = {
  description: "",
  items: [] as Array<{ archivedAt: string | null }>,
  estimates: [] as Array<{ archivedAt: string | null }>,
};

vi.mock("@/features/voice-capture/hooks/useProjectDescriptionNote", () => ({
  useProjectDescriptionNote: () => ({ text: state.description, loading: false }),
}));
vi.mock("@/features/scope/hooks/useScope", () => ({
  useScopeItemsQuery: () => ({ data: state.items, isLoading: false }),
}));
vi.mock("@/features/estimating/hooks/useEstimating", () => ({
  useEstimatesQuery: () => ({ data: state.estimates, isLoading: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: never) => {
    const p = to as unknown as string;
    return (
      <a href={p} className={className as unknown as string}>
        {children as unknown as React.ReactNode}
      </a>
    );
  },
}));

beforeEach(() => {
  state.description = "";
  state.items = [];
  state.estimates = [];
});

describe("project intake state", () => {
  it("treats a blank project as unstarted (chooser shows)", () => {
    const { result } = renderHook(() => useProjectIntakeState("p1"));
    expect(result.current.isUnstarted).toBe(true);
  });

  it("hides the chooser once a dictated description exists", () => {
    state.description = "Remove the old kitchen cabinets and install new ones.";
    const { result } = renderHook(() => useProjectIntakeState("p1"));
    expect(result.current.hasCapturedDescription).toBe(true);
    expect(result.current.isUnstarted).toBe(false);
  });

  it("hides the chooser once structured scope items exist", () => {
    state.items = [{ archivedAt: null }];
    const { result } = renderHook(() => useProjectIntakeState("p1"));
    expect(result.current.hasStructuredScope).toBe(true);
    expect(result.current.isUnstarted).toBe(false);
  });

  it("hides the chooser once an estimate exists", () => {
    state.estimates = [{ archivedAt: null }];
    const { result } = renderHook(() => useProjectIntakeState("p1"));
    expect(result.current.hasEstimate).toBe(true);
    expect(result.current.isUnstarted).toBe(false);
  });
});

describe("Add More Information menu", () => {
  it("keeps all three intake methods available as secondary actions", async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ContinueEstimateActions projectId="p1" projectName="Kitchen" variant="menu" />
      </I18nextProvider>,
    );
    await userEvent.click(screen.getByTestId("add-more-information"));
    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/app/walkthrough",
      "/app/remote-vision",
      "/app/capture",
    ]);
  });
});
