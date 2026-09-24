import { describe, expect, it } from "vitest";
import { mapEstimate } from "../services/mappers";
import { setStatusSchema } from "../services/schemas";
import { LEGACY_ESTIMATE_STATUSES } from "../types";

const baseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  project_id: "33333333-3333-4333-8333-333333333333",
  version: 1,
  title: "Estimate v1",
  status: "draft",
  currency: "USD",
  created_by: "44444444-4444-4444-8444-444444444444",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("estimate lineage model (Phase 1)", () => {
  it("defaults legacy rows without lineage columns to a self-rooted original", () => {
    const dto = mapEstimate({ ...baseRow });
    expect(dto.documentKind).toBe("estimate");
    expect(dto.lineageRootId).toBe(baseRow.id);
    expect(dto.revisionNumber).toBe(0);
    expect(dto.optionLabel).toBeNull();
    expect(dto.supersededById).toBeNull();
    expect(dto.sentAt).toBeNull();
    expect(dto.acceptedAt).toBeNull();
    expect(dto.declinedAt).toBeNull();
    expect(dto.lockedAt).toBeNull();
  });

  it("maps populated lineage metadata", () => {
    const dto = mapEstimate({
      ...baseRow,
      document_kind: "alternate",
      lineage_root_id: "55555555-5555-4555-8555-555555555555",
      revision_number: 2,
      option_label: "Option B",
      superseded_by_id: "66666666-6666-4666-8666-666666666666",
      status: "superseded",
      sent_at: "2026-02-01T00:00:00.000Z",
      accepted_at: null,
      declined_at: null,
      locked_at: "2026-02-02T00:00:00.000Z",
    });
    expect(dto.documentKind).toBe("alternate");
    expect(dto.lineageRootId).toBe("55555555-5555-4555-8555-555555555555");
    expect(dto.revisionNumber).toBe(2);
    expect(dto.optionLabel).toBe("Option B");
    expect(dto.supersededById).toBe("66666666-6666-4666-8666-666666666666");
    expect(dto.status).toBe("superseded");
    expect(dto.sentAt).toBe("2026-02-01T00:00:00.000Z");
    expect(dto.lockedAt).toBe("2026-02-02T00:00:00.000Z");
  });

  it("keeps the settable status endpoint restricted to the legacy set", () => {
    for (const status of LEGACY_ESTIMATE_STATUSES) {
      expect(setStatusSchema.safeParse({ estimateId: baseRow.id, status }).success).toBe(true);
    }
    for (const status of ["accepted", "sent", "declined", "superseded"]) {
      expect(setStatusSchema.safeParse({ estimateId: baseRow.id, status }).success).toBe(false);
    }
  });
});
