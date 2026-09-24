import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Tabs active-state visibility", () => {
  const src = read("src/components/ui/tabs.tsx");

  it("gives the active tab a visible blue border, light blue tint, and blue text", () => {
    // Active state must stand out with a blue (primary) outline, a very light
    // blue background tint, and blue text. It must NOT fade into the gray
    // background like the old `bg-background` treatment.
    expect(src).toMatch(/data-\[state=active\]:border/);
    expect(src).toMatch(/data-\[state=active\]:border-primary/);
    expect(src).toMatch(/data-\[state=active\]:bg-primary/);
    expect(src).toMatch(/data-\[state=active\]:text-primary/);
    expect(src).not.toMatch(/data-\[state=active\]:bg-background/);
  });

  it("keeps inactive tabs secondary and uses a subtle pale-blue hover", () => {
    // Inactive tabs should remain quiet (no solid fill) and hover to a pale
    // blue, never to gold accent or a heavy dark-gray fill.
    expect(src).toMatch(/hover:bg-primary/);
    expect(src).not.toMatch(/hover:bg-accent/);
    expect(src).not.toMatch(/hover:bg-muted/);
    expect(src).not.toMatch(/hover:bg-foreground/);
  });

  it("preserves rounded corners, spacing, transition, and keyboard focus styles", () => {
    expect(src).toMatch(/rounded-md/);
    expect(src).toMatch(/px-3/);
    expect(src).toMatch(/py-1/);
    expect(src).toMatch(/transition-all/);
    expect(src).toMatch(/focus-visible:ring-2/);
    expect(src).toMatch(/focus-visible:ring-ring/);
    expect(src).toMatch(/focus-visible:ring-offset-2/);
  });
});
