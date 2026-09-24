/** One-off: materialize Pembroke roofing + siding assemblies with real dollars. */
import { createClient } from "@supabase/supabase-js";
import { materializeExpansion, runReview } from "@/features/estimating/services/assemblyExpansion.core";

const ROOF_LINE = "f7e5d507-b06c-4a3a-91a0-314dec9894fc";
const SIDE_LINE = "9996667e-47bf-443f-96fd-8ee6fe8882ae";
const ROOF_EXP = "806613bd-ec85-40c0-9b4f-732052c5ad74";
const SIDE_EXP = "9025800c-a03c-4496-a445-21e348f0aae8";

const sb: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: parent } = await sb
  .from("estimate_line_items")
  .select("created_by")
  .eq("id", ROOF_LINE)
  .maybeSingle();
const userId = parent.created_by as string;

// Clean slate: archive every prior child of both parents, override flag or not.
await sb
  .from("estimate_line_items")
  .update({ archived_at: new Date().toISOString() })
  .in("parent_line_id", [ROOF_LINE, SIDE_LINE])
  .is("archived_at", null);

for (const [exp, line, label] of [
  [ROOF_EXP, ROOF_LINE, "roofing"],
  [SIDE_EXP, SIDE_LINE, "siding"],
] as const) {
  await sb.from("assembly_expansions").update({ review_status: "reviewed" }).eq("id", exp);
  await runReview(sb, { expansionId: exp, estimateLineId: line, components: [], markReviewed: true, userId } as any);
  const res = await materializeExpansion(sb, { estimateLineId: line, userId });
  console.log(label, res);
}

for (const [line, label] of [[ROOF_LINE, "roofing"], [SIDE_LINE, "siding"]] as const) {
  const { data: kids } = await sb
    .from("estimate_line_items")
    .select("description, quantity, unit_key, unit_cost:material_cost, labor_hours, labor_rate, direct_cost, pricing_source, resolution_status")
    .eq("parent_line_id", line)
    .is("archived_at", null)
    .order("sort_order");
  console.log("\n===", label);
  let sum = 0;
  for (const k of kids ?? []) {
    sum += Number(k.direct_cost ?? 0);
    console.log(
      `${String(k.description).padEnd(34)} ${String(k.quantity).padStart(8)} ${String(k.unit_key).padEnd(12)} $${String(k.direct_cost).padStart(8)} ${k.pricing_source} ${k.resolution_status}`,
    );
  }
  const { data: p } = await sb.from("estimate_line_items").select("direct_cost").eq("id", line).maybeSingle();
  console.log(`parent $${p.direct_cost} + children $${sum}`);
}
