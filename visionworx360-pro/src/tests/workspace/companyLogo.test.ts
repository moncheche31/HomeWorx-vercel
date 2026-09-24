import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LOGO_MAX_BYTES,
  isStoragePath,
  validateLogoFile,
} from "@/features/workspace/services/branding.shared";
import { buildProposal, defaultProposalSettings } from "@/domains/proposal/build";

describe("company logo validation", () => {
  it("accepts common web image types", () => {
    expect(validateLogoFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateLogoFile({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validateLogoFile({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("rejects unsupported types (including SVG) and oversized files", () => {
    expect(validateLogoFile({ type: "image/svg+xml", size: 100 })).toBe("type");
    expect(validateLogoFile({ type: "application/pdf", size: 100 })).toBe("type");
    expect(validateLogoFile({ type: "image/png", size: LOGO_MAX_BYTES + 1 })).toBe("size");
  });

  it("treats org-scoped object keys as storage paths and absolute urls as direct", () => {
    expect(isStoragePath("org-1/logo-abc.png")).toBe(true);
    expect(isStoragePath("https://cdn.example.com/a.png")).toBe(false);
    expect(isStoragePath(null)).toBe(false);
  });
});

describe("company logo server rules", () => {
  const source = readFileSync("src/features/workspace/services/branding.functions.ts", "utf8");

  it("derives the organization server-side and rejects cross-org paths", () => {
    expect(source).toContain("current_active_organization_id");
    expect(source).toContain("Invalid storage path");
    expect(source).not.toMatch(/organizationId:\s*z\./);
  });

  it("requires an authenticated caller on every branding function", () => {
    const middlewares = source.match(/requireSupabaseAuth/g) ?? [];
    const fns = source.match(/createServerFn\(/g) ?? [];
    expect(middlewares.length).toBeGreaterThanOrEqual(fns.length);
  });
});

const baseInput = (settings: Record<string, unknown> = {}) => ({
  projectId: "p1",
  projectName: "Kitchen Remodel",
  locale: "en-US" as const,
  audience: "homeowner" as const,
  customer: { name: "Ada" },
  branding: {
    companyName: "Acme Builders",
    tagline: null,
    logoUrl: "https://signed.example.com/logo.png" as string | null,
    accentColor: null,
  },
  approvedScopeText: "Install new cabinets.",
  settings: { ...defaultProposalSettings(), template: "contractor", ...settings },
});

describe("proposal branding uses the canonical company logo", () => {
  it("renders the contractor proposal with the organization logo", () => {
    const doc = buildProposal(baseInput() as never);
    expect(doc.branding.logoUrl).toBe("https://signed.example.com/logo.png");
  });

  it("omits the logo when the organization has none (no broken image)", () => {
    const input = baseInput();
    input.branding.logoUrl = null;
    const doc = buildProposal(input as never);
    expect(doc.branding.logoUrl).toBeNull();
  });

  it("uses a replacement logo immediately for newly built documents", () => {
    const input = baseInput();
    input.branding.logoUrl = "https://signed.example.com/logo-v2.png";
    const doc = buildProposal(input as never);
    expect(doc.branding.logoUrl).toBe("https://signed.example.com/logo-v2.png");
  });

  it("does not apply the contractor logo when a brand name override is intentional", () => {
    const doc = buildProposal(
      baseInput({ brandNameOverride: "VisionWorx 360 Design Studio" }) as never,
    );
    expect(doc.branding.companyName).toBe("VisionWorx 360 Design Studio");
    expect(doc.branding.logoUrl).toBeNull();
  });
});

describe("auth middleware guardrail", () => {
  it("registers only the configured attacher", () => {
    const start = readFileSync("src/start.ts", "utf8");
    expect(start).toContain("attachConfiguredAuth");
    expect(start).not.toContain("attachSupabaseAuth");
  });
});
