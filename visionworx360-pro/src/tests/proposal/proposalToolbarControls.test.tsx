/**
 * Regression coverage for proposal controls that were dead on arrival.
 *
 * 1. "Proposal settings" was wired to a `canPrint` flag derived from
 *    `doc.canFinalize`. Whenever detailed pricing was still incomplete —
 *    exactly when a contractor wants to hide the investment section or edit
 *    warranty/vision wording — the button rendered permanently disabled with
 *    no way to enable it. Proposal settings are presentation-only and must
 *    never depend on pricing completeness.
 * 2. The printable document view must not render before the locally persisted
 *    proposal settings have hydrated, otherwise a printed/PDF proposal can be
 *    composed from default template/theme/section settings.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProposalToolbar } from "@/features/proposal/components/ProposalToolbar";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, "aria-label": label }: { children: React.ReactNode; "aria-label"?: string }) => (
    <a href="#" aria-label={label}>
      {children}
    </a>
  ),
}));

const toolbarSource = readFileSync(
  "src/features/proposal/components/ProposalToolbar.tsx",
  "utf8",
);
const printPageSource = readFileSync(
  "src/features/proposal/pages/ProposalPrintPage.tsx",
  "utf8",
);

function renderToolbar(onOpenSettings = vi.fn()) {
  render(
    <ProposalToolbar
      template="contractor"
      onTemplateChange={vi.fn()}
      theme="classic"
      onThemeChange={vi.fn()}
      audience="customer"
      onAudienceChange={vi.fn()}
      onOpenSettings={onOpenSettings}
      onSendToClient={vi.fn()}
      canSend
      projectId="p-1"
    />,
  );
  return screen.getByRole("button", { name: /proposal settings|settings/i });
}

describe("proposal toolbar controls", () => {
  it("keeps the proposal settings control usable regardless of pricing state", () => {
    const settingsButton = renderToolbar();
    expect(settingsButton).not.toBeDisabled();
  });

  it("no longer gates any toolbar control on pricing completeness", () => {
    expect(toolbarSource).not.toContain("canPrint");
    expect(toolbarSource).not.toContain("canFinalize");
  });

  it("still exposes the preview / print destination", () => {
    expect(toolbarSource).toContain('to="/proposal-print/$projectId"');
  });
});

describe("labeled proposal actions", () => {
  it("shows explicit Print Proposal and Preview actions — no unlabeled icon action", () => {
    renderToolbar();
    expect(screen.getByRole("link", { name: /print proposal|imprimir propuesta/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /preview|vista previa/i })).toBeTruthy();
  });

  it("routes the print action through the print-safe view with auto-print", () => {
    expect(toolbarSource).toContain("search={{ autoprint: true }}");
  });
});

describe("printable proposal document", () => {
  it("waits for persisted proposal settings before composing the document", () => {
    expect(printPageSource).toContain("!proposal.hydrated");
  });

  it("offers both Print and Save as PDF via the browser print path", () => {
    expect(printPageSource).toContain('t("toolbar.printProposal")');
    expect(printPageSource).toContain('t("toolbar.savePdf")');
    expect(printPageSource).not.toMatch(/jspdf|html2pdf/i);
  });
});
