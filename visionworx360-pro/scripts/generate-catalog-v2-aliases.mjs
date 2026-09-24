/**
 * Projects INTENT_RULES_V2 into SQL rows for public.catalog_intent_aliases at
 * library_version 2. The TypeScript intent map stays the single source of
 * truth; this script only serializes it.
 *
 * Run: bun scripts/generate-catalog-v2-aliases.mjs
 */
import { writeFileSync } from "node:fs";
import { INTENT_RULES_V2 } from "../src/domains/estimating/pricing/intentMapV2.ts";
import { normalizePhrase } from "../src/domains/estimating/pricing/intentMap.ts";

const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const values = [];
for (const rule of INTENT_RULES_V2) {
  const alias = normalizePhrase(rule.phrase);
  const priority = rule.priority ?? 100;
  if (rule.review) {
    values.push(`  (2, ${q(alias)}, ${q(rule.matchKind)}, NULL, 1, NULL, ${priority}, ${q(rule.review)}, ${q(rule.note)})`);
    continue;
  }
  for (const c of rule.components ?? []) {
    values.push(
      `  (2, ${q(alias)}, ${q(rule.matchKind)}, ${q(c.assemblyKey)}, ${c.quantityFactor}, ${q(c.role)}, ${priority}, NULL, ${q(rule.note)})`,
    );
  }
}

const sql = [
  "-- GENERATED FILE — do not edit by hand.",
  "-- Source: scripts/generate-catalog-v2-aliases.mjs (src/domains/estimating/pricing/intentMapV2.ts)",
  "INSERT INTO public.catalog_intent_aliases",
  "  (library_version, alias_norm, match_kind, assembly_key, quantity_factor, role, priority, review_reason, note) VALUES",
  values.join(",\n"),
  "ON CONFLICT (library_version, alias_norm, COALESCE(assembly_key, '')) DO NOTHING;",
  "",
].join("\n");

writeFileSync("supabase/seed/knowledge-base-v2-aliases.sql", sql);
console.error(`v2 alias rows: ${values.length} from ${INTENT_RULES_V2.length} rules`);
