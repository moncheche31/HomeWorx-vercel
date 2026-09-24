import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Get project",
  description:
    "Get one project with its client details and the estimates attached to it.",
  inputSchema: { project_id: z.string().uuid().describe("Project id.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data: project, error } = await supabase
      .from("projects")
      .select(
        "id, name, description, status, priority, budget, target_completion, internal_notes, last_activity_at, client_id, property_id",
      )
      .eq("id", project_id)
      .maybeSingle();
    if (error) return failed(error.message);
    if (!project) return failed("Project not found or not accessible.");

    const [{ data: client }, { data: estimates, error: estimatesError }] = await Promise.all([
      supabase
        .from("clients")
        .select("id, first_name, last_name, company, email, phone")
        .eq("id", project.client_id)
        .maybeSingle(),
      supabase
        .from("estimates")
        .select("id, title, status, revision_number, document_kind, pricing_method, updated_at")
        .eq("project_id", project_id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false }),
    ]);
    if (estimatesError) return failed(estimatesError.message);

    return json({ project, client: client ?? null, estimates: estimates ?? [] });
  },
});
