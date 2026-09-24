import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_clients",
  title: "List clients",
  description: "List CRM clients in the signed-in user's organization, newest first.",
  inputSchema: {
    search: z.string().trim().min(1).optional().describe("Filter by name or company."),
    limit: z.number().int().min(1).max(100).default(25).describe("Max clients to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("clients")
      .select("id, first_name, last_name, company, email, phone, city, region, status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`,
      );
    }
    const { data, error } = await query;
    if (error) return failed(error.message);
    return json({ clients: data ?? [] });
  },
});
