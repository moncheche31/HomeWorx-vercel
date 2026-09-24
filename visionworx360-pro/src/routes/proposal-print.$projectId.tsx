import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "./ProtectedRoute";
import { WorkspaceProvider } from "@/features/workspace/providers/WorkspaceProvider";
import { ProposalPrintPage } from "@/features/proposal/pages/ProposalPrintPage";

/**
 * Deliberately outside the /app layout: the printable proposal must render
 * without app navigation or chrome, while still requiring an authenticated
 * contractor session.
 *
 * WorkspaceProvider is mounted explicitly here. The proposal document reads
 * organization branding through `useWorkspace()`, which throws outside a
 * provider — that was the source of the generic "Something went wrong" screen
 * when this route rendered outside the main app layout.
 */
export const Route = createFileRoute("/proposal-print/$projectId")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    autoprint: search["autoprint"] === "1" || search["autoprint"] === true ? true : undefined,
  }),
  component: () => (
    <ProtectedRoute>
      <WorkspaceProvider>
        <ProposalPrintPage />
      </WorkspaceProvider>
    </ProtectedRoute>
  ),
});
