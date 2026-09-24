import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import i18n from "@/i18n/config";
import { ContinueEstimateActions } from "./ContinueEstimateActions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children, className }: never) => {
    const props = { to, search, children, className } as {
      to: string;
      search: Record<string, string>;
      children: React.ReactNode;
      className?: string;
    };
    return (
      <a
        href={props.to}
        className={props.className}
        data-project-id={props.search.projectId}
        data-project-name={props.search.projectName}
      >
        {props.children}
      </a>
    );
  },
}));

function renderActions() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ContinueEstimateActions projectId="proj-1" projectName="Kitchen Remodel" />
    </I18nextProvider>,
  );
}

describe("ContinueEstimateActions", () => {
  it("offers all three estimating methods for any existing project", () => {
    renderActions();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/app/walkthrough",
      "/app/remote-vision",
      "/app/capture",
    ]);
  });

  it("preselects the current project on every method (no duplicate project)", () => {
    renderActions();
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveAttribute("data-project-id", "proj-1");
      expect(link).toHaveAttribute("data-project-name", "Kitchen Remodel");
    }
  });

  it("renders the three methods as equal secondary outline buttons", () => {
    const { container } = renderActions();
    const buttons = Array.from(container.querySelectorAll("a"));
    const classes = buttons.map((b) => b.className);
    expect(new Set(classes).size).toBe(1);
    expect(classes[0]).toContain("border-primary/40");
    expect(classes[0]).not.toContain("bg-primary ");
    expect(classes[0]).not.toContain("accent");
  });
});
