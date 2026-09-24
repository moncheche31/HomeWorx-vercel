import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { planProposalGallery, type ProposalGalleryGroup } from "@/domains/proposal";

vi.mock("@/features/project-workspace/components/SignedImage", () => ({
  SignedImage: ({ alt, className }: { alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} className={className} src="stub" />
  ),
}));

const { ProposalGallery } = await import("@/features/proposal/components/ProposalGallery");

const media = (id: string, kind: string) => ({
  id,
  kind,
  storagePath: `p/${id}.jpg`,
  caption: null,
  altText: `${kind} ${id}`,
});

const group = (kind: ProposalGalleryGroup["kind"], label: string, ids: string[]) =>
  ({ kind, label, media: ids.map((id) => media(id, kind)) }) as unknown as ProposalGalleryGroup;

const renderGallery = (groups: ProposalGalleryGroup[]) =>
  render(<ProposalGallery projectId="proj-1" groups={groups} />);

describe("proposal gallery hierarchy", () => {
  it("2 before + 1 after: after is dominant, before are supporting thumbnails", () => {
    const groups = [group("before", "Before", ["b1", "b2"]), group("rendering", "After", ["a1"])];
    const plan = planProposalGallery(groups);
    expect(plan.primary?.kind).toBe("rendering");
    expect(plan.primarySingle).toBe(true);
    expect(plan.supporting.map((g) => g.kind)).toEqual(["before"]);

    const { container } = renderGallery(groups);
    const primary = container.querySelector('[data-testid="proposal-gallery-primary"] ul')!;
    const supporting = container.querySelector('[data-testid="proposal-gallery-supporting"] ul')!;
    expect(primary.className).toContain("grid-cols-1");
    expect(primary.className).not.toContain("sm:grid-cols-2");
    expect(supporting.className).toContain("grid-cols-2");
    expect(supporting.className).toContain("md:max-w-[60%]");
    // no media dropped, labels preserved
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("After")).toBeTruthy();
    expect(screen.getByText("Before")).toBeTruthy();
  });

  it("1 before + 1 after: after still carries greater visual weight", () => {
    const { container } = renderGallery([
      group("before", "Before", ["b1"]),
      group("rendering", "After", ["a1"]),
    ]);
    const primaryImg = container.querySelector('[data-testid="proposal-gallery-primary"] img')!;
    const supportingImg = container.querySelector('[data-testid="proposal-gallery-supporting"] img')!;
    expect(primaryImg.className).toContain("aspect-[16/10]");
    expect(primaryImg.className).toContain("object-contain");
    expect(supportingImg.className).toContain("object-cover");
  });

  it("multiple after images use a sensible responsive grid, still above before", () => {
    const groups = [group("before", "Before", ["b1"]), group("rendering", "After", ["a1", "a2"])];
    expect(planProposalGallery(groups).primarySingle).toBe(false);
    const { container } = renderGallery(groups);
    const primary = container.querySelector('[data-testid="proposal-gallery-primary"] ul')!;
    expect(primary.className).toContain("sm:grid-cols-2");
    const testids = [...container.querySelectorAll("[data-testid]")].map((n) =>
      n.getAttribute("data-testid"),
    );
    expect(testids.indexOf("proposal-gallery-primary")).toBeLessThan(
      testids.indexOf("proposal-gallery-supporting"),
    );
  });

  it("before-only: renders normally with no empty dominant slot", () => {
    const groups = [group("before", "Before", ["b1", "b2"])];
    const plan = planProposalGallery(groups);
    expect(plan.primary).toBeNull();
    expect(plan.supportingOnly).toBe(true);
    const { container } = renderGallery(groups);
    expect(container.querySelectorAll('[data-testid="proposal-gallery-supporting"]')).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(2);
  });

  it("mobile layout does not overflow: grid tracks and min-w-0 items, no fixed widths", () => {
    const { container } = renderGallery([
      group("before", "Before", ["b1", "b2"]),
      group("rendering", "After", ["a1"]),
    ]);
    for (const li of container.querySelectorAll("li")) {
      expect(li.className).toContain("min-w-0");
      expect(li.className).not.toMatch(/w-\[\d/);
    }
  });

  it("print/PDF uses the same gallery component — no print-only hierarchy", () => {
    const printPage = readFileSync("src/features/proposal/pages/ProposalPrintPage.tsx", "utf8");
    const docView = readFileSync(
      "src/features/proposal/components/ProposalDocumentView.tsx",
      "utf8",
    );
    expect(printPage).toContain("ProposalDocumentView");
    expect(docView).toContain("<ProposalGallery");
  });
});
