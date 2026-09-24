import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClientsTool from "./tools/list-clients";
import listProjectsTool from "./tools/list-projects";
import getProjectTool from "./tools/get-project";
import getEstimateTool from "./tools/get-estimate";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "visionworx360-pro",
  title: "VisionWorx360 Pro",
  version: "0.1.0",
  instructions:
    "Read-only access to VisionWorx360 Pro construction estimating data for the signed-in contractor. Use `list_clients` and `list_projects` to find records, `get_project` for a project with its client and estimates, and `get_estimate` for pricing settings, line items, direct cost and labor hours.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listClientsTool, listProjectsTool, getProjectTool, getEstimateTool],
});
