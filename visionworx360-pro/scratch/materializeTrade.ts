/**
 * One-off verification: expand + review + materialize one trade's lines on a
 * real estimate, then read the dollars back with service-role SQL.
 *
 * Usage: bun scratch/materializeTrade.ts <estimateId> <tradeKey>
 */
import { createClient } from "@supabase/supabase-js";
import {
  materializeExpansion,
  runExpansion,
  runReview,
} from "@/features/estimating/services/assemblyExpansion.core";
import { expansionTradeForLine } from "@/features/estimating/services/assemblyExpansion.shared";

const [estimateId, tradeKey] = process.argv.slice(2);
if (!estimateId || !tradeKey) throw new Error("usage: <estimateId> <tradeKey>");

const sb: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const directCost = async () => {
  const { data } = await sb
    .from("estimate_line_items")
    .select("direct_cost")
    .eq("estimate_id", estimateId)
    .is("archived_at", null);
  return (data as { direct_cost: number }[]).reduce((s, r) => s + Number(r.direct_cost ?? 0), 0);
};

const before = await directCost();

const { data: lines } = await sb
  .from("estimate_line_items")
  .select("id, description, trade_key, quantity, unit_key, direct_cost, created_by")
  .eq("estimate_id", estimateId)
  .eq("trade_key", tradeKey)
  .is("archived_at", null)
  .is("parent_line_id", null);

console.log(`\n=== ${tradeKey} — ${lines.length} parent line(s). Estimate before: $${before}`);

for (const line of lines as any[]) {
  if (!expansionTradeForLine(line.trade_key, line.description)) {
    console.log(`  skip (not expandable): ${line.description}`);
    continue;
  }
  try {
    const dto = await runExpansion(sb, {
      estimateLineId: line.id,
      userId: line.created_by,
      regenerate: false,
    });
    if (!dto.components.length) {
      console.log(`  ${line.description}: expansion unavailable (${dto.error})`);
      continue;
    }
    await runReview(sb, {
      expansionId: dto.id,
      estimateLineId: line.id,
      components: [],
      markReviewed: true,
      userId: line.created_by,
    });
    const res = await materializeExpansion(sb, {
      estimateLineId: line.id,
      userId: line.created_by,
    });
    const { data: kids } = await sb
      .from("estimate_line_items")
      .select("description, quantity, unit_key, direct_cost, resolution_status, pricing_source")
      .eq("parent_line_id", line.id)
      .is("archived_at", null);
    const sum = (kids as any[]).reduce((s, k) => s + Number(k.direct_cost ?? 0), 0);
    const unresolved = (kids as any[]).filter((k) => k.resolution_status !== "resolved");
    console.log(
      `  ${line.description} [${line.quantity} ${line.unit_key}] parent $${line.direct_cost} + children $${sum} (${kids.length} children, ${unresolved.length} unresolved)`,
    );
    for (const k of kids as any[]) {
      console.log(
        `     - ${k.description}: ${k.quantity} ${k.unit_key} $${k.direct_cost} ${k.resolution_status} ${k.pricing_source}`,
      );
    }
    void res;
  } catch (e) {
    console.log(`  ${line.description}: FAILED ${(e as Error).message}`);
  }
}

console.log(`=== Estimate after: $${await directCost()}\n`);
