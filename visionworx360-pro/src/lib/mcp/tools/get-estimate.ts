import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { failed, json, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "get_estimate",
  title: "Get estimate",
  description:
    "Get one estimate with its pricing settings, its active line items, and the summed direct cost and labor hours.",
  inputSchema: {
    estimate_id: z.string().uuid().describe("Estimate id."),
    include_lines: z.boolean().default(true).describe("Include the individual line items."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ estimate_id, include_lines }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data: estimate, error } = await supabase
      .from("estimates")
      .select(
        "id, project_id, title, status, revision_number, document_kind, intake_mode, currency, pricing_method, pricing_mode, target_gross_margin_pct, default_overhead_pct, default_profit_pct, default_contingency_pct, default_labor_rate, tax_rate, range_snapshot, updated_at",
      )
      .eq("id", estimate_id)
      .maybeSingle();
    if (error) return failed(error.message);
    if (!estimate) return failed("Estimate not found or not accessible.");

    const { data: lines, error: linesError } = await supabase
      .from("estimate_line_items")
      .select(
        "id, description, category_key, quantity, catalog_item_key, labor_hours, labor_rate, material_cost, equipment_cost, other_cost, direct_cost, resolution_status, is_price_overridden",
      )
      .eq("estimate_id", estimate_id)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (linesError) return failed(linesError.message);

    const rows = lines ?? [];
    const totals = rows.reduce(
      (acc, line) => ({
        direct_cost: acc.direct_cost + Number(line.direct_cost ?? 0),
        labor_hours: acc.labor_hours + Number(line.labor_hours ?? 0),
        line_count: acc.line_count + 1,
      }),
      { direct_cost: 0, labor_hours: 0, line_count: 0 },
    );

    return json({
      estimate,
      totals,
      lines: include_lines === false ? undefined : rows,
    });
  },
});
