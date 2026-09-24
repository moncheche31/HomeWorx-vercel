import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canTransitionChangeRequest,
  countOpenChangeRequests,
  generateShareToken,
  hashShareToken,
  resolveShareAccess,
  sanitizeShareDocument,
  shareMediaPaths,
  shareSelectableOptions,
  shareUrl,
} from "@/domains/proposal/share";
import { containsInternalTerms } from "@/domains/proposal";
import type { ProposalDocument } from "@/domains/proposal";

const doc = {
  projectId: "p1",
  locale: "en-US",
  audience: "contractor",
  theme: "classic",
  template: "contractor",
  templateContent: null,
  proposalNumber: "P-1",
  issuedAt: "2026-01-01",
  branding: {
    companyName: "Acme",
    logoUrl: "blob:secret",
    contractorPhotoUrl: null,
    phone: null,
    email: null,
    website: null,
    addressLine: null,
    licenseNumber: null,
    insuranceLine: null,
    accentColor: null,
  },
  customer: { name: "Jane", propertyAddress: "1 Main" },
  projectName: "Garage Conversion",
  vision: "A bright new suite.",
  scopeSections: [
    {
      key: "s1",
      title: "Framing",
      lines: ["Frame new partition walls.", "Labor hours: 42 at a 38% markup."],
    },
    { key: "s2", title: "Internal", lines: ["Overhead and profit review."] },
  ],
  scopeIntro: null,
  gallery: [
    {
      kind: "before",
      label: "Before",
      media: [
        { id: "m1", kind: "before", storagePath: "org/1.jpg", caption: null, altText: null },
      ],
    },
  ],
  investment: [
    { key: "good", label: "Good", summary: "", amount: 1000, includes: [], recommended: true },
  ],
  upgrades: [{ id: "u1", label: "Heated floor", description: "", priceLabel: null }],
  schedule: [],
  warranty: "One year.",
  acceptance: { statement: "", acceptedAt: null, acceptedByName: null },
  sections: ["cover", "scope", "investment"],
  awaitingApproval: false,
  pricingSource: { kind: "detailed_complete", total: 1000 },
  canFinalize: true,
  asIllustrated: null,
} as unknown as ProposalDocument;

describe("share tokens", () => {
  it("mints unguessable url-safe tokens", () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("stores only a hash, never the token", async () => {
    const token = generateShareToken();
    const hash = await hashShareToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
    expect(await hashShareToken(token)).toEqual(hash);
  });

  it("builds the public portal url", () => {
    expect(shareUrl("https://x.app/", "abc")).toBe("https://x.app/p/abc");
  });
});

describe("share access", () => {
  it("denies missing, revoked and expired shares", () => {
    expect(resolveShareAccess(null)).toEqual({ ok: false, reason: "not_found" });
    expect(resolveShareAccess({ status: "revoked", expiresAt: null })).toEqual({
      ok: false,
      reason: "revoked",
    });
    expect(
      resolveShareAccess({ status: "active", expiresAt: "2020-01-01T00:00:00Z" }),
    ).toEqual({ ok: false, reason: "expired" });
  });

  it("allows an active unexpired share", () => {
    expect(
      resolveShareAccess(
        { status: "active", expiresAt: "2999-01-01T00:00:00Z" },
        new Date("2026-01-01"),
      ),
    ).toEqual({ ok: true });
  });
});

describe("sent snapshot", () => {
  it("is customer facing and free of internal terminology", () => {
    const snapshot = sanitizeShareDocument(doc);
    expect(snapshot.audience).toBe("customer");
    expect(snapshot.branding.logoUrl).toBeNull();
    const text = snapshot.scopeSections.flatMap((s) => s.lines).join(" ");
    expect(text).toContain("Frame new partition walls.");
    expect(containsInternalTerms(text)).toBe(false);
  });

  it("does not mutate the contractor document", () => {
    sanitizeShareDocument(doc);
    expect(doc.audience).toBe("contractor");
    expect(doc.scopeSections[1]?.lines).toHaveLength(1);
  });

  it("scopes resolvable media to the sent gallery", () => {
    expect(shareMediaPaths(doc)).toEqual(["org/1.jpg"]);
  });

  it("offers only contractor-published options to the client", () => {
    expect(shareSelectableOptions(doc)).toEqual([
      { kind: "investment_level", key: "good", label: "Good" },
      { kind: "upgrade", key: "u1", label: "Heated floor" },
    ]);
  });
});

describe("change request lifecycle", () => {
  it("counts only open requests for the contractor badge", () => {
    expect(
      countOpenChangeRequests([
        { status: "requested" },
        { status: "reviewing" },
        { status: "applied" },
        { status: "declined" },
      ]),
    ).toBe(2);
  });

  it("treats applied and declined as terminal", () => {
    expect(canTransitionChangeRequest("requested", "applied")).toBe(true);
    expect(canTransitionChangeRequest("reviewing", "declined")).toBe(true);
    expect(canTransitionChangeRequest("applied", "declined")).toBe(false);
    expect(canTransitionChangeRequest("declined", "applied")).toBe(false);
    expect(canTransitionChangeRequest("requested", "requested")).toBe(false);
  });
});

describe("client authority boundaries", () => {
  const portal = readFileSync("src/features/client-portal/pages/ClientProposalPage.tsx", "utf8");
  const form = readFileSync(
    "src/features/client-portal/components/ClientChangeRequestForm.tsx",
    "utf8",
  );
  const toolbar = readFileSync("src/features/proposal/components/ProposalToolbar.tsx", "utf8");

  it("exposes Send to Client next to preview and print", () => {
    expect(toolbar).toContain("toolbar.sendToClient");
    expect(toolbar).toContain("toolbar.printProposal");
  });

  it("renders the portal read-only, with no acceptance or signature", () => {
    expect(portal).toContain("readOnly");
    expect(portal).not.toContain("onAccept={proposal");
    expect(portal).toContain("portal.readOnlyNote");
  });

  it("gives the client exactly one write path: a change request", () => {
    expect(form).toContain("submitProposalChangeRequest");
    for (const forbidden of ["updateProposal", "saveProposal", "setEstimate", "supabase.from("]) {
      expect(form).not.toContain(forbidden);
      expect(portal).not.toContain(forbidden);
    }
  });
});
