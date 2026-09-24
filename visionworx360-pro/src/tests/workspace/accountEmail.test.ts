import { describe, it, expect, vi } from "vitest";
import { syncMyProfileEmail, saveMyProfile } from "@/features/workspace/services/profile.server";
import { accountEmailSchema } from "@/features/workspace/services/profile.shared";
import { saveMyOrganization } from "@/features/workspace/services/organization.server";
import { saveOrgSchema } from "@/features/workspace/services/organization.shared";
import { buildProposal, defaultProposalSettings } from "@/domains/proposal/build";

/** Minimal PostgREST-style stub recording the statements it receives. */
function stubClient(opts: {
  profileRow?: Record<string, unknown> | null;
  orgRow?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  onUpdate?: (table: string, payload: Record<string, unknown>) => void;
}) {
  const make = (table: string) => {
    let payload: Record<string, unknown> | null = null;
    const self = {
      select: () => self,
      update: (p: Record<string, unknown>) => {
        payload = p;
        return self;
      },
      eq: () => self,
      maybeSingle: async () => {
        if (payload) opts.onUpdate?.(table, payload);
        if (table === "profiles") {
          const row = opts.profileRow ?? null;
          return { data: row ? { ...row, ...(payload ?? {}) } : null, error: null };
        }
        if (table === "user_roles") return { data: opts.membership ?? null, error: null };
        return {
          data: opts.orgRow ? { ...opts.orgRow, ...(payload ?? {}) } : null,
          error: null,
        };
      },
      single: async () => self.maybeSingle(),
    };
    return self;
  };
  return { from: (table: string) => make(table), rpc: vi.fn() } as never;
}

const PROFILE = {
  id: "user-1",
  organization_id: "org-1",
  email: "old@example.com",
  first_name: "Ada",
};

const ORG = {
  id: "org-1",
  organization_name: "Acme Builders",
  email: "office@acme.test",
  tax_rate: 0,
};

describe("account (login) email", () => {
  it("validates malformed addresses and rejects blanks", () => {
    expect(accountEmailSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(accountEmailSchema.safeParse({ email: "   " }).success).toBe(false);
    expect(accountEmailSchema.safeParse({ email: " New@Example.com " }).success).toBe(true);
  });

  it("mirrors the verified auth email onto the profile row", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = stubClient({
      profileRow: PROFILE,
      onUpdate: (table, payload) => {
        if (table === "profiles") writes.push(payload);
      },
    });
    const result = await syncMyProfileEmail(client, "user-1", "New@Example.com");
    expect(writes).toEqual([{ email: "new@example.com" }]);
    expect(result.email).toBe("new@example.com");
  });

  it("does not write when the mirror already matches", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = stubClient({
      profileRow: PROFILE,
      onUpdate: (table, payload) => {
        if (table === "profiles") writes.push(payload);
      },
    });
    await syncMyProfileEmail(client, "user-1", "OLD@example.com");
    expect(writes).toHaveLength(0);
  });

  it("never accepts an email through the personal-profile save path", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = stubClient({
      profileRow: PROFILE,
      onUpdate: (table, payload) => {
        if (table === "profiles") writes.push(payload);
      },
    });
    await saveMyProfile(client, "user-1", {
      firstName: "Ada",
      // @ts-expect-error email is intentionally not part of the profile save input
      email: "spoofed@example.com",
    });
    expect(writes[0]).not.toHaveProperty("email");
  });
});

describe("company / proposal contact email", () => {
  it("validates the address and allows an intentional clear", () => {
    expect(
      saveOrgSchema.safeParse({ organizationName: "Acme", email: "bad" }).success,
    ).toBe(false);
    expect(
      saveOrgSchema.safeParse({ organizationName: "Acme", email: "sales@acme.test" }).success,
    ).toBe(true);
    expect(saveOrgSchema.safeParse({ organizationName: "Acme", email: "" }).success).toBe(true);
  });

  it("persists canonically on the organization row and survives reload", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = stubClient({
      profileRow: PROFILE,
      orgRow: ORG,
      onUpdate: (table, payload) => {
        if (table === "organizations") writes.push(payload);
      },
    });
    const saved = await saveMyOrganization(client, "user-1", {
      organizationName: "Acme Builders",
      email: "sales@acme.test",
    });
    expect(writes[0]?.email).toBe("sales@acme.test");
    // Re-read shape (mapped row) carries the stored value.
    expect(saved.email).toBe("sales@acme.test");
  });

  it("feeds the proposal contact block from the canonical org email", () => {
    const doc = buildProposal({
      projectId: "p-1",
      projectName: "Garage Conversion",
      locale: "en-US",
      audience: "customer",
      customer: { name: "Jane Doe", propertyAddress: "12 Oak St" },
      branding: {
        companyName: "Acme Builders",
        logoUrl: null,
        contractorPhotoUrl: null,
        phone: "555-0100",
        email: "sales@acme.test",
        website: null,
        addressLine: null,
        licenseNumber: null,
        insuranceLine: null,
        accentColor: null,
      },
      approvedScopeText: "Convert the garage.",
      settings: defaultProposalSettings(),
    });
    expect(doc.branding.email).toBe("sales@acme.test");
  });
});
