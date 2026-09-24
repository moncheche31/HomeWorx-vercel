import { useOptionalWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import type { AppRole } from "@/features/workspace/types";

/**
 * Roles allowed to permanently destroy CRM records. Kept in lockstep with the
 * `can_delete_org_records` database check — the UI gate is convenience only,
 * the server-side RPC is the real boundary. Client/portal visitors have no
 * workspace at all, so they never see the controls.
 */
export const DELETE_CAPABLE_ROLES: readonly AppRole[] = ["owner", "administrator"];

export function roleCanDeleteRecords(role: AppRole | null | undefined): boolean {
  return !!role && DELETE_CAPABLE_ROLES.includes(role);
}

export function useCanDeleteRecords(): boolean {
  const workspace = useOptionalWorkspace();
  return roleCanDeleteRecords(workspace?.profile?.role ?? null);
}
