import { describe, it, expect } from "vitest";
import { logDomainEvent } from "./domainEvents";

describe("logDomainEvent", () => {
  it("skips Contractor project events (already written by DB triggers) with explicit result", () => {
    const result = logDomainEvent({
      organizationId: "org1",
      productKey: "CONTRACTOR",
      actorUserId: "u1",
      domain: "scope",
      action: "created",
      entityType: "scope_item",
      entityId: "i1",
      projectId: "p1",
    });
    expect(result.status).toBe("skipped_by_policy");
  });

  it("returns 'unsupported' for unknown product/domain combinations (never silent success)", () => {
    const result = logDomainEvent({
      organizationId: "org1",
      productKey: "REALTOR",
      actorUserId: "u1",
      domain: "listing",
      action: "created",
      entityType: "listing",
    });
    expect(result.status).toBe("unsupported");
    expect(result.status).not.toBe("logged");
  });
});
