import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en-US/estimating.json";
import es from "@/i18n/locales/es-US/estimating.json";
import { mapEstimate } from "../services/mappers";
import { createRevisionSchema } from "../services/schemas";
import { getRevisionUiState, toLineageDocument } from "../revisionState";
import { describeDocument, isReadOnly } from "@/domains/estimating";

const SRC = "11111111-1111-4111-8111-111111111111";
const NEW = "77777777-7777-4777-8777-777777777777";

const row = (over: Record<string, unknown> = {}) =>
  mapEstimate({
    id: SRC,
    organization_id: "22222222-2222-4222-8222-222222222222",
    project_id: "33333333-3333-4333-8333-333333333333",
    version: 1,
    title: "Estimate v1",
    status: "draft",
    currency: "USD",
    created_by: "44444444-4444-4444-8444-444444444444",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...over,
  });

describe("estimate revisions (Phase 3) — UI state", () => {
  it("offers the action on an editable draft, but not as the primary CTA", () => {
    const s = getRevisionUiState(row());
    expect(s.canRevise).toBe(true);
    expect(s.reviseIsPrimary).toBe(false);
    expect(s.readOnly).toBe(false);
    expect(s.showSupersededBanner).toBe(false);
  });

  it("makes revising the recommended (solid blue) step on an approved estimate", () => {
    const s = getRevisionUiState(row({ status: "approved" }));
    expect(s.canRevise).toBe(true);
    expect(s.reviseIsPrimary).toBe(true);
    expect(s.readOnly).toBe(true);
  });

  it("marks a superseded estimate read-only with a banner and no revise action", () => {
    const s = getRevisionUiState(
      row({ status: "superseded", superseded_by_id: NEW, locked_at: "2026-02-01T00:00:00.000Z" }),
    );
    expect(s.canRevise).toBe(false);
    expect(s.readOnly).toBe(true);
    expect(s.showSupersededBanner).toBe(true);
    expect(s.supersededById).toBe(NEW);
  });

  it("hides the action on archived estimates and on non-estimate documents", () => {
    expect(getRevisionUiState(row({ archived_at: "2026-02-01T00:00:00.000Z" })).canRevise).toBe(false);
    expect(getRevisionUiState(row({ document_kind: "change_order" })).canRevise).toBe(false);
  });

  it("keeps the new revision editable and pointed at the same project", () => {
    const created = row({
      id: NEW,
      version: 2,
      status: "draft",
      lineage_root_id: SRC,
      revision_number: 1,
      parent_estimate_id: SRC,
    });
    expect(isReadOnly(toLineageDocument(created))).toBe(false);
    expect(created.projectId).toBe(row().projectId);
    expect(created.lineageRootId).toBe(SRC);
    expect(created.revisionNumber).toBe(1);
  });

  it("labels lineage documents through the shared helpers", () => {
    expect(describeDocument(toLineageDocument(row())).text).toBe("Estimate v1");
    expect(
      describeDocument(toLineageDocument(row({ id: NEW, lineage_root_id: SRC, revision_number: 2 })))
        .text,
    ).toBe("Estimate v3");
  });
});

describe("estimate revisions (Phase 3) — contract", () => {
  it("accepts only a uuid source estimate id and no client-supplied organization", () => {
    expect(createRevisionSchema.safeParse({ estimateId: SRC }).success).toBe(true);
    expect(createRevisionSchema.safeParse({ estimateId: "nope" }).success).toBe(false);
    const parsed = createRevisionSchema.parse({
      estimateId: SRC,
      organizationId: "99999999-9999-4999-8999-999999999999",
    });
    expect(parsed).toEqual({ estimateId: SRC });
  });

  it("resolves every new string in English and Spanish", () => {
    const keys = ["confirmTitle", "confirmBody", "confirmAction", "creating",
      "supersededBanner", "openNewer"] as const;
    for (const k of keys) {
      expect(en.revision[k]).toBeTruthy();
      expect(es.revision[k]).toBeTruthy();
      expect(en.revision[k]).not.toBe(es.revision[k]);
    }
    expect(en.actions.createRevision).toBe("Revise Current Estimate");
    expect(es.actions.createRevision).toBeTruthy();
    expect(en.toast.revisionCreated).toBeTruthy();
    expect(es.toast.revisionExists).toBeTruthy();
  });
});
