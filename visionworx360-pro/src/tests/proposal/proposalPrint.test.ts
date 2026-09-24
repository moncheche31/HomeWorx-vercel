import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import enProposal from "@/i18n/locales/en-US/proposal.json";
import esProposal from "@/i18n/locales/es-US/proposal.json";

const printPage = readFileSync("src/features/proposal/pages/ProposalPrintPage.tsx", "utf8");
const route = readFileSync("src/routes/proposal-print.$projectId.tsx", "utf8");
const toolbar = readFileSync("src/features/proposal/components/ProposalToolbar.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");
const printBlock = styles.slice(styles.indexOf("@media print"));

describe("proposal print view", () => {
  it("is reachable from the contractor proposal toolbar", () => {
    expect(toolbar).toContain('to="/proposal-print/$projectId"');
    expect(toolbar).toContain('t("toolbar.printProposal")');
    expect(toolbar).toContain('t("toolbar.previewProposal")');
  });

  it("renders outside the app layout but still behind auth", () => {
    expect(route).toContain("ProtectedRoute");
    expect(route).not.toContain("AppLayout");
  });

  it("mounts the workspace provider the proposal branding depends on", () => {
    // Root cause of the generic "Something went wrong": useWorkspace() throws
    // outside a provider, and this route renders outside the main app layout.
    expect(route).toContain("WorkspaceProvider");
  });

  it("supports an auto-print entry point gated on hydrated settings", () => {
    expect(route).toContain("autoprint");
    expect(printPage).toContain("window.print()");
    expect(printPage).toContain("proposal.hydrated");
  });

  it("shows a specific print failure message, not a generic one", () => {
    expect(printPage).toContain('t("print.error")');
  });

  it("reuses the same proposal document model — no second data source", () => {
    expect(printPage).toContain("useProposal(projectId");
    expect(printPage).toContain("ProposalDocumentView");
    expect(printPage).not.toContain("composeProposal");
  });

  it("shows the customer-facing document and no contractor-only view", () => {
    expect(printPage).toContain('useProposal(projectId, "customer")');
  });

  it("keeps every on-screen control out of the printed output", () => {
    expect(printPage).toContain("proposal-no-print");
    expect(printBlock).toContain(".proposal-no-print");
    expect(printBlock).toContain("data-app-chrome");
  });

  it("marks app chrome so it never prints", () => {
    for (const file of [
      "src/features/workspace/components/AppTopBar.tsx",
      "src/features/workspace/components/AppSidebar.tsx",
      "src/features/workspace/components/MobileBottomNav.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("data-app-chrome");
    }
  });

  it("exposes a share path for mobile browsers that support it", () => {
    expect(printPage).toContain("navigator.share");
  });
});

describe("print stylesheet", () => {
  it("targets US Letter with printable margins", () => {
    expect(printBlock).toMatch(/@page\s*\{[^}]*size:\s*letter/);
    expect(printBlock).toMatch(/margin:\s*0\.5in/);
  });

  it("avoids splitting sections and orphaned headings", () => {
    expect(printBlock).toContain("break-inside: avoid");
    expect(printBlock).toContain("break-after: avoid-page");
  });

  it("does not emit a blank page for empty optional sections", () => {
    expect(printBlock).toContain(".proposal-section:empty");
    expect(printBlock).toContain(".proposal-page-break:last-child");
  });

  it("keeps images inside the page box", () => {
    expect(printBlock).toMatch(/img\s*\{[^}]*max-width:\s*100%/);
  });
});

describe("print view localization", () => {
  it("has EN and ES labels for the preview action", () => {
    expect((enProposal as { toolbar: Record<string, string> }).toolbar.preview).toBeTruthy();
    expect((esProposal as { toolbar: Record<string, string> }).toolbar.preview).toBeTruthy();
    expect((enProposal as { toolbar: Record<string, string> }).toolbar.preview).not.toBe(
      (esProposal as { toolbar: Record<string, string> }).toolbar.preview,
    );
  });

  it("has EN and ES labels for the print and PDF actions", () => {
    const en = (enProposal as { toolbar: Record<string, string> }).toolbar;
    const es = (esProposal as { toolbar: Record<string, string> }).toolbar;
    for (const key of ["previewProposal", "printProposal", "savePdf"]) {
      expect(en[key]).toBeTruthy();
      expect(es[key]).toBeTruthy();
      expect(en[key]).not.toBe(es[key]);
    }
  });

  it("uses translation keys only — no hardcoded copy in the print page", () => {
    expect(printPage).toContain('useTranslation("proposal")');
    expect(printPage).not.toMatch(/>\s*Print\s*</);
  });
});

describe("branding and pricing sources", () => {
  const cover = readFileSync("src/features/proposal/components/ProposalCover.tsx", "utf8");

  it("prints the canonical company logo when present and omits it otherwise", () => {
    expect(cover).toContain("doc.branding.logoUrl ?");
    expect(cover).toContain("onError");
  });

  it("prints the same authoritative pricing as the on-screen proposal", () => {
    // Both surfaces render the identical composed document; the print page
    // performs no pricing work of its own.
    expect(printPage).not.toMatch(/total|price|amount/i);
  });
});

describe("auth middleware guardrail", () => {
  it("registers only the configured attacher", () => {
    const start = readFileSync("src/start.ts", "utf8");
    expect(start).toContain("attachConfiguredAuth");
    expect(start).not.toContain("attachSupabaseAuth");
  });
});

describe("authenticated navigation to the print view", () => {
  const authProvider = readFileSync("src/features/auth/providers/AuthProvider.tsx", "utf8");
  const localSession = readFileSync("src/lib/auth/localSession.ts", "utf8");

  it("stays in the same tab so the live session is reused", () => {
    expect(toolbar).not.toContain('target="_blank"');
  });

  it("offers a way back to the project from the print view", () => {
    expect(printPage).toContain('to="/app/proposal/$projectId"');
  });

  it("never wipes still-valid tokens when session restore is slow", () => {
    expect(authProvider).toContain("!hasUnexpiredStoredSession()");
    expect(localSession).toContain("export function hasUnexpiredStoredSession");
  });

  it("applies a session that restores after the timeout budget", () => {
    expect(authProvider).toContain("late session restore applied");
  });
});
