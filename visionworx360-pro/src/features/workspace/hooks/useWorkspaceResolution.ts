import { useAuth } from "@/features/auth/hooks/useAuth";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { workspaceDiagnostic } from "@/lib/diagnostics/workspaceDiagnostics";

/**
 * Resolution state of "can we trust an active organization id right now?".
 *
 * This exists so data surfaces never interpret an unresolved workspace as a
 * successful empty result. Only `ready` means: authenticated user + verified
 * active organization, so a zero-row query is genuinely empty.
 */
export type WorkspaceResolution =
  | "loading"
  | "unauthenticated"
  | "org-loading"
  | "org-missing"
  | "org-error"
  | "ready";

export function useWorkspaceResolution(): {
  state: WorkspaceResolution;
  organizationId: string | null;
  retry: () => void;
} {
  const { status } = useAuth();
  const { organization, organizationStatus, refreshOrganization } = useWorkspace();

  const retry = () => {
    void refreshOrganization();
  };

  const resolvedState: WorkspaceResolution = status === "unauthenticated"
    ? "unauthenticated"
    : status !== "authenticated"
      ? "loading"
      : organizationStatus === "error"
        ? "org-error"
        : organizationStatus === "loading"
          ? "org-loading"
          : organizationStatus === "missing" || !organization?.id
            ? "org-missing"
            : "ready";

  workspaceDiagnostic("workspace.resolution", {
    lifecycleStage: "workspace-hook",
    authReady: status === "authenticated",
    userPresent: status === "authenticated",
    organizationIdPresent: Boolean(organization?.id),
    workspaceState: resolvedState,
  });

  return {
    state: resolvedState,
    organizationId: resolvedState === "ready" ? organization?.id ?? null : null,
    retry,
  };
}
