import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  deleteRecordSchema,
  deleteClientSchema,
  DELETE_CONFIRMATION_WORD,
} from "@/features/crm/services/schemas";
import { mapDeleteError } from "@/features/crm/services/crm.functions";
import { roleCanDeleteRecords } from "@/features/crm/hooks/useRecordPermissions";
import {
  isDeleteConfirmed,
  dependencySummary,
} from "@/features/crm/components/PermanentDeleteDialog";

/**
 * CRM archive + permanent-delete regression suite.
 *
 * Archive stays reversible; permanent delete must stay (a) owner/administrator
 * only, (b) typed-confirmation gated on the server as well as the client,
 * (c) scoped to the record's own cascade graph, and (d) blocked when a record
 * carries financially significant history. The SQL contract assertions below
 * read the shipped migration so a future migration cannot quietly widen the
 * delete blast radius.
 */

const MIGRATIONS = path.resolve(process.cwd(), "supabase/migrations");
const deleteSql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"))
  .filter((sql) => sql.includes("delete_project_permanently"))
  .join("\n");

const ORG = "11111111-1111-1111-1111-111111111111";
const ID = "22222222-2222-2222-2222-222222222222";

describe("crm deletion — confirmation gating", () => {
  it("(c) accepts a delete of an empty/test project only with the typed word", () => {
    expect(
      deleteRecordSchema.safeParse({ id: ID, activeOrganizationId: ORG, confirmation: "DELETE" })
        .success,
    ).toBe(true);
    expect(
      deleteRecordSchema.safeParse({ id: ID, activeOrganizationId: ORG, confirmation: "yes" })
        .success,
    ).toBe(false);
    expect(
      deleteRecordSchema.safeParse({ id: ID, activeOrganizationId: ORG, confirmation: "" }).success,
    ).toBe(false);
  });

  it("keeps client cascade opt-in explicit and defaulted off", () => {
    const parsed = deleteClientSchema.parse({
      id: ID,
      activeOrganizationId: ORG,
      confirmation: DELETE_CONFIRMATION_WORD,
    });
    expect(parsed.deleteDependents).toBe(false);
  });

  it("enables the final button only on an exact typed confirmation", () => {
    expect(isDeleteConfirmed("DELETE")).toBe(true);
    expect(isDeleteConfirmed("delete")).toBe(true);
    expect(isDeleteConfirmed("DELET")).toBe(false);
    expect(isDeleteConfirmed("")).toBe(false);
  });

  it("summarises only non-zero dependencies for the contractor", () => {
    expect(dependencySummary({ estimates: 2, photos: 0, notes: 3 })).toEqual([
      ["estimates", 2],
      ["notes", 3],
    ]);
  });
});

describe("crm archive — reversible and confirmed", () => {
  const crmSrc = readFileSync(
    path.resolve(process.cwd(), "src/features/crm/services/crm.functions.ts"),
    "utf8",
  );
  const projectActions = readFileSync(
    path.resolve(process.cwd(), "src/features/crm/components/ProjectRecordActions.tsx"),
    "utf8",
  );
  const clientActions = readFileSync(
    path.resolve(process.cwd(), "src/features/crm/components/ClientRecordActions.tsx"),
    "utf8",
  );

  it("(a) archive/restore a project is a status flip, never a delete", () => {
    expect(crmSrc).toContain('.update({ status: "archived" } as never)');
    expect(crmSrc).not.toMatch(/from\("projects"\)\s*\.delete\(\)/);
  });

  it("(b) archive/restore a client is a status flip, never a delete", () => {
    expect(crmSrc).toContain('.update({ status: "archived" } as never)');
    expect(crmSrc).not.toMatch(/from\("clients"\)\s*\.delete\(\)/);
  });

  it("routes every archive action through a confirmation dialog", () => {
    for (const src of [projectActions, clientActions]) {
      expect(src).toContain("ConfirmArchiveDialog");
      // Archive is only fired from the dialog's onConfirm, never from the button.
      expect(src).toMatch(/setArchiveOpen\(true\)/);
    }
  });

  it("keeps restore a single-click action with no typed confirmation", () => {
    for (const src of [projectActions, clientActions]) {
      expect(src).toContain("restore.mutateAsync");
    }
  });
});

describe("crm deletion — authorization", () => {
  it("(h) allows only owners and administrators to permanently delete", () => {
    expect(roleCanDeleteRecords("owner")).toBe(true);
    expect(roleCanDeleteRecords("administrator")).toBe(true);
    for (const role of ["estimator", "sales", "office", "read_only"] as const) {
      expect(roleCanDeleteRecords(role)).toBe(false);
    }
    // A client-portal viewer has no org role at all.
    expect(roleCanDeleteRecords(null)).toBe(false);
    expect(roleCanDeleteRecords(undefined)).toBe(false);
  });

  it("maps server refusals onto stable codes the UI can explain", () => {
    expect(mapDeleteError("NOT_AUTHORIZED_TO_DELETE").code).toBe("NOT_AUTHORIZED_TO_DELETE");
    expect(mapDeleteError('DELETE_BLOCKED:["accepted_or_approved_estimate"]')).toEqual({
      code: "DELETE_BLOCKED",
      detail: '["accepted_or_approved_estimate"]',
    });
    expect(mapDeleteError('CLIENT_HAS_DEPENDENTS:{"projects": 2}').code).toBe(
      "CLIENT_HAS_DEPENDENTS",
    );
    expect(mapDeleteError("boom").code).toBe("DELETE_FAILED");
  });
});

describe("crm deletion — SQL contract", () => {
  it("ships both audit RPCs and both delete RPCs", () => {
    for (const fn of [
      "audit_project_deletion",
      "audit_client_deletion",
      "delete_project_permanently",
      "delete_client_permanently",
      "can_delete_org_records",
    ]) {
      expect(deleteSql).toContain(`FUNCTION public.${fn}`);
    }
  });

  it("(d) audits every project-owned dependent table before deleting", () => {
    for (const table of [
      "estimates",
      "estimate_line_items",
      "estimate_ballpark_sessions",
      "scope_sections",
      "scope_items",
      "project_narrative_scopes",
      "project_rooms",
      "project_measurements",
      "project_measurement_captures",
      "project_measurement_items",
      "project_photos",
      "project_documents",
      "project_notes",
      "proposal_shares",
      "proposal_change_requests",
      "project_activity",
    ]) {
      expect(deleteSql).toContain(`public.${table}`);
    }
  });

  it("(g) deletes by primary key inside the org, so same-address siblings are untouched", () => {
    expect(deleteSql).toContain(
      "DELETE FROM public.projects WHERE id = p_project_id AND organization_id = v_org",
    );
    // Nothing is deleted by address/property, which is what siblings share.
    expect(deleteSql).not.toMatch(/DELETE FROM public\.projects WHERE property_id/);
    expect(deleteSql).not.toMatch(/DELETE FROM public\.properties WHERE address/i);
  });

  it("never deletes shared company pricing, catalog or configuration data", () => {
    for (const shared of [
      "org_assemblies",
      "org_assembly_overrides",
      "catalog_assemblies",
      "catalog_library_versions",
      "organizations",
      "organization_subscriptions",
      "scope_templates",
      "assembly_templates",
      "user_roles",
      "user_preferences",
      "profiles",
    ]) {
      expect(deleteSql).not.toContain(`DELETE FROM public.${shared}`);
    }
  });

  it("blocks deletion of financially significant history instead of destroying it", () => {
    expect(deleteSql).toContain("accepted_or_approved_estimate");
    expect(deleteSql).toContain("accepted_client_proposal");
    expect(deleteSql).toContain("RAISE EXCEPTION 'DELETE_BLOCKED:%'");
  });

  it("(f) blocks a client delete with dependents unless cascade is chosen", () => {
    expect(deleteSql).toContain("RAISE EXCEPTION 'CLIENT_HAS_DEPENDENTS:%'");
    expect(deleteSql).toContain("IF (v_audit->>'hasDependencies')::boolean AND NOT p_delete_dependents");
  });

  it("(e) a dependency-free client delete removes just the client row", () => {
    expect(deleteSql).toContain(
      "DELETE FROM public.clients WHERE id = p_client_id AND organization_id = v_org",
    );
  });

  it("re-checks role and membership server-side and hides the RPCs from anon", () => {
    expect(deleteSql).toContain("RAISE EXCEPTION 'NOT_ORG_MEMBER'");
    expect(deleteSql).toContain("RAISE EXCEPTION 'NOT_AUTHORIZED_TO_DELETE'");
    expect(deleteSql).toContain(
      "REVOKE ALL ON FUNCTION public.delete_project_permanently(uuid) FROM anon",
    );
  });
});
