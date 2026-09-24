import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("button hierarchy + hover tokens", () => {
  it("outline and ghost buttons hover to pale blue, never gold accent", () => {
    const src = read("src/components/ui/button.tsx");
    const outline = src.match(/outline:\s*\n?\s*"([^"]+)"/)?.[1] ?? "";
    const ghost = src.match(/ghost:\s*"([^"]+)"/)?.[1] ?? "";
    for (const v of [outline, ghost]) {
      expect(v).not.toMatch(/accent/);
      expect(v).toContain("hover:bg-primary/10");
      expect(v).toContain("hover:text-primary");
    }
    expect(src).toMatch(/default: "bg-primary text-primary-foreground shadow hover:bg-primary\/90"/);
  });
});

describe("dashboard quick actions", () => {
  const src = read("src/features/workspace/pages/DashboardPage.tsx");

  it("has exactly one Quick Actions section", () => {
    expect(src.match(/cards\.quickActions\.title/g)).toHaveLength(1);
    expect(src).toContain('data-testid="quick-actions"');
  });

  it("keeps every existing quick action in the consolidated section", () => {
    for (const key of ["viewProjects", "viewCustomers", "inviteTeammate"]) {
      expect(src.match(new RegExp(`cards\\.quickActions\\.${key}`, "g"))).toHaveLength(1);
    }
    for (const route of ["/app/projects", "/app/clients", "/app/customers"]) {
      expect(src).toContain(`to="${route}"`);
    }
  });

  it("uses outline quick actions so they do not compete with Create New Estimate", () => {
    const section = src.slice(src.indexOf('data-testid="quick-actions"'));
    const card = section.slice(0, section.indexOf("</Card>"));
    expect(card.match(/variant="outline"/g)).toHaveLength(3);
    expect(card).not.toMatch(/<Button asChild className=/);
    // Create New Estimate remains the prominent primary CTA (wizard owns it).
    expect(src).toContain("<CreateEstimateWizard />");
  });

  it("places Quick Actions directly below Create Estimate and above informational cards", () => {
    const createEstimateIdx = src.indexOf("<CreateEstimateWizard />");
    const quickActionsIdx = src.indexOf('data-testid="quick-actions"');
    const recentProjectsIdx = src.indexOf("cards.recentProjects.title");
    const recentEstimatesIdx = src.indexOf("cards.recentEstimates.title");

    expect(createEstimateIdx).toBeGreaterThan(-1);
    expect(quickActionsIdx).toBeGreaterThan(createEstimateIdx);
    expect(recentProjectsIdx).toBeGreaterThan(quickActionsIdx);
    expect(recentEstimatesIdx).toBeGreaterThan(quickActionsIdx);
  });

  it("no longer renders the activity feed on the dashboard", () => {
    expect(src).not.toContain("cards.activity.title");
    expect(src).not.toContain("OrgActivityFeed");
  });
});

describe("scope screens hierarchy", () => {
  it("Build Detailed Scope keeps Start Blank as the only primary action", () => {
    const src = read("src/features/scope/components/ScopeTab.tsx");
    const empty = src.slice(src.indexOf("empty.startBlank"));
    const block = empty.slice(0, empty.indexOf("</Card>") + 1);
    expect(block.match(/variant="outline"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/<Button className="min-h-12 w-full" onClick=\{startBlank\}>/);
  });

  it("Estimate Review lives in the Estimate More Options menu, never under Scope", () => {
    const src = read("src/features/estimating/components/EstimateTab.tsx");
    const idx = src.indexOf('data-testid="estimate-review-action"');
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx - 120, idx)).toContain("<DropdownMenuItem");

    const scope = read("src/features/narrative-scope/components/NarrativeScopeTab.tsx");
    expect(scope).not.toContain("estimate-review-action");
    expect(scope).not.toContain("CopilotReviewDialog");
  });

});
