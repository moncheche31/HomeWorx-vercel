import { describe, it, expect, vi } from "vitest";
import { saveMyProfile } from "@/features/workspace/services/profile.server";
import { saveProfileSchema, mapProfileRow } from "@/features/workspace/services/profile.shared";
import { saveMyOrganization, resolveMyWorkspace } from "@/features/workspace/services/organization.server";
import { mapOrgRow } from "@/features/workspace/services/organization.shared";

/** Minimal PostgREST-style stub that records the statements it receives. */
function stubClient(opts: {
  profileRow?: Record<string, unknown> | null;
  orgRow?: Record<string, unknown> | null;
  membership?: Record<string, unknown> | null;
  onUpdate?: (table: string, payload: Record<string, unknown>, eq: Record<string, unknown>) => void;
}) {
  const eqs: Record<string, unknown> = {};
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    let payload: Record<string, unknown> | null = null;
    const self = {
      select: () => self,
      update: (p: Record<string, unknown>) => {
        payload = p;
        return self;
      },
      eq: (col: string, val: unknown) => {
        eqs[`${table}.${col}`] = val;
        return self;
      },
      maybeSingle: async () => {
        if (payload) opts.onUpdate?.(table, payload, { ...eqs });
        if (table === "profiles") {
          const row = opts.profileRow ?? null;
          return { data: row ? { ...row, ...(payload ?? {}) } : null, error: null };
        }
        if (table === "user_roles") return { data: opts.membership ?? null, error: null };
        return { data: opts.orgRow ?? null, error: null };
      },
      single: async () => self.maybeSingle(),
    };
    return Object.assign(builder, self);
  };
  return {
    from: (table: string) => make(table),
    rpc: vi.fn(),
    __eqs: eqs,
  } as never;
}

describe("profile editing", () => {
  it("accepts editable fields and rejects privileged ones", () => {
    const parsed = saveProfileSchema.parse({
      firstName: "Michael",
      lastName: "Cadorette",
      displayName: "Mike C",
      phone: "555-1212",
      language: "en-US",
      timezone: "America/New_York",
      measurementPreference: "imperial",
      // Not part of the schema — must be dropped, never written.
      role: "administrator",
      organizationId: "other-org",
      email: "attacker@example.com",
    } as never) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("role");
    expect(parsed).not.toHaveProperty("organizationId");
    expect(parsed).not.toHaveProperty("email");
  });

  it("load -> edit -> save writes only whitelisted columns scoped to the caller", async () => {
    const writes: { table: string; payload: Record<string, unknown>; eq: Record<string, unknown> }[] = [];
    const client = stubClient({
      profileRow: {
        id: "u-1",
        first_name: "Old",
        last_name: "Name",
        display_name: null,
        phone: null,
        email: "michael@example.com",
        role: "owner",
        organization_id: "org-1",
        language: "en-US",
        timezone: "America/New_York",
        measurement_preference: "imperial",
      },
      onUpdate: (table, payload, eq) => writes.push({ table, payload, eq }),
    });

    const result = await saveMyProfile(client, "u-1", {
      firstName: "Michael",
      lastName: "Cadorette",
      displayName: "Mike C",
      phone: "555-1212",
      language: "es-US",
      timezone: "America/Denver",
      measurementPreference: "metric",
    });

    expect(writes).toHaveLength(1);
    expect(writes[0].table).toBe("profiles");
    // RLS scoping: the statement targets the authenticated user's own row only.
    expect(writes[0].eq["profiles.id"]).toBe("u-1");
    expect(Object.keys(writes[0].payload).sort()).toEqual([
      "display_name",
      "first_name",
      "language",
      "last_name",
      "measurement_preference",
      "phone",
      "timezone",
    ]);
    expect(writes[0].payload).not.toHaveProperty("role");
    expect(writes[0].payload).not.toHaveProperty("organization_id");
    // Reload shape reflects the saved values.
    expect(result.firstName).toBe("Michael");
    expect(result.displayName).toBe("Mike C");
    expect(result.measurementPreference).toBe("metric");
    // Values not edited are preserved.
    expect(result.email).toBe("michael@example.com");
    expect(result.role).toBe("owner");
  });

  it("never resets untouched fields when the payload omits them", async () => {
    const writes: Record<string, unknown>[] = [];
    const client = stubClient({
      profileRow: { id: "u-1", first_name: "Keep", phone: "555" },
      onUpdate: (_t, payload) => writes.push(payload),
    });
    await saveMyProfile(client, "u-1", { displayName: "Only Display" });
    expect(writes[0]).toEqual({ display_name: "Only Display" });
  });

  it("exposes the canonical profile row through the workspace lookup", async () => {
    const client = stubClient({
      profileRow: {
        id: "u-1",
        organization_id: "org-1",
        first_name: "Michael",
        display_name: "Mike C",
        phone: "555-1212",
        role: "owner",
      },
      membership: { organization_id: "org-1" },
      orgRow: {
        id: "org-1",
        organization_name: "Cadorette Builders",
        license_state: "MA",
        primary_trade: "general_contractor",
      },
    });
    const res = await resolveMyWorkspace(client, "u-1");
    expect(res.profile?.displayName).toBe("Mike C");
    expect(res.profile?.phone).toBe("555-1212");
    expect(res.organization?.organizationName).toBe("Cadorette Builders");
  });
});

describe("organization editing", () => {
  it("keeps licenseState and primaryTrade on the canonical org shape", () => {
    const org = mapOrgRow({
      id: "org-1",
      organization_name: "Cadorette Builders",
      license_state: "MA",
      license_number: "CS-1234",
      primary_trade: "general_contractor",
    });
    expect(org.licenseState).toBe("MA");
    expect(org.primaryTrade).toBe("general_contractor");
    expect(org.licenseNumber).toBe("CS-1234");
  });

  it("updates the caller's own organization, derived server-side", async () => {
    const seen: { table: string; eq: Record<string, unknown> }[] = [];
    const client = stubClient({
      profileRow: { id: "u-1", organization_id: "org-1" },
      orgRow: { id: "org-1", organization_name: "Renamed Co" },
      onUpdate: (table, _p, eq) => seen.push({ table, eq }),
    });
    const org = await saveMyOrganization(client, "u-1", {
      organizationName: "Renamed Co",
      secondaryBusinessTypes: [],
    } as never);
    expect(org.organizationName).toBe("Renamed Co");
    const orgWrite = seen.find((s) => s.table === "organizations");
    // No cross-org edit: the update is pinned to the org id read from the
    // caller's own profile row, never a client-supplied id.
    expect(orgWrite?.eq["organizations.id"]).toBe("org-1");
  });
});

describe("mapProfileRow", () => {
  it("does not invent defaults for absent columns", () => {
    const p = mapProfileRow({ id: "u-1" });
    expect(p.language).toBeUndefined();
    expect(p.role).toBeUndefined();
    expect(p.timezone).toBeUndefined();
  });
});
