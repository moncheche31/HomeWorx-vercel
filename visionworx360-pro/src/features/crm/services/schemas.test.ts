import { describe, it, expect } from "vitest";
import {
  createClientSchema,
  updateClientSchema,
  createPropertySchema,
  createProjectSchema,
  listClientsSchema,
  listProjectsSchema,
  idWithOrgSchema,
} from "./schemas";

const ORG = "11111111-1111-1111-1111-111111111111";
const ID = "22222222-2222-2222-2222-222222222222";
const CID = "33333333-3333-3333-3333-333333333333";
const PID = "44444444-4444-4444-4444-444444444444";

describe("CRM schemas", () => {
  it("createClient requires an activeOrganizationId (uuid)", () => {
    expect(() => createClientSchema.parse({ firstName: "a" })).toThrow();
    expect(() => createClientSchema.parse({ activeOrganizationId: "not-a-uuid" })).toThrow();
    const ok = createClientSchema.parse({ activeOrganizationId: ORG, firstName: "Mike" });
    expect(ok.activeOrganizationId).toBe(ORG);
    expect(ok.preferredContact).toBe("any");
  });

  it("createProperty requires clientId + activeOrganizationId and coerces numerics", () => {
    const parsed = createPropertySchema.parse({
      activeOrganizationId: ORG,
      clientId: CID,
      yearBuilt: "1998",
      squareFootage: "2400",
      bedrooms: "3",
      bathrooms: "2.5",
      stories: "2",
    });
    expect(parsed.yearBuilt).toBe(1998);
    expect(parsed.bathrooms).toBe(2.5);
  });

  it("createProject requires name, clientId, propertyId", () => {
    expect(() => createProjectSchema.parse({ activeOrganizationId: ORG })).toThrow();
    const p = createProjectSchema.parse({
      activeOrganizationId: ORG,
      clientId: CID,
      propertyId: PID,
      name: "Kitchen remodel",
    });
    expect(p.status).toBe("lead");
    expect(p.priority).toBe("normal");
  });

  it("list filter schemas default to safe values", () => {
    const l = listClientsSchema.parse({ activeOrganizationId: ORG });
    expect(l.page).toBe(1);
    expect(l.includeArchived).toBe(false);
    const pl = listProjectsSchema.parse({ activeOrganizationId: ORG });
    expect(pl.sort).toBe("recent");
  });

  it("update schemas require id", () => {
    expect(() => updateClientSchema.parse({ activeOrganizationId: ORG })).toThrow();
    const ok = updateClientSchema.parse({ activeOrganizationId: ORG, id: ID });
    expect(ok.id).toBe(ID);
  });

  it("idWithOrgSchema rejects missing org", () => {
    expect(() => idWithOrgSchema.parse({ id: ID })).toThrow();
    expect(idWithOrgSchema.parse({ id: ID, activeOrganizationId: ORG })).toEqual({
      id: ID,
      activeOrganizationId: ORG,
    });
  });
});
