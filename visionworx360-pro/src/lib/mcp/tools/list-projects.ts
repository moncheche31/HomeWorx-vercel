import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_projects",
  title: "List projects",
  description:
    "List construction projects visible to the signed-in user, most recently active first.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Filter by project name."),
    status: z.string().trim().min(1).optional().describe("Filter by project status."),
    limit: z.number().int().min(1).max(100).default(25).describe("Max projects to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("projects")
      .select(
        "id, name, description, status, priority, budget, target_completion, last_activity_at, client_id",
      )
      .order("last_activity_at", { ascending: false })
      .limit(limit ?? 25);
    if (search) query = query.ilike("name", `%${search}%`);
    if (status) query = query.eq("status", status as never);
    const { data, error } = await query;
    if (error) return failed(error.message);
    return json({ projects: data ?? [] });
  },
});
