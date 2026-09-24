/**
 * Emits the SQL body for the pricing-coverage migration:
 *  - INSERT rows for assemblies added by the coverage pass
 *  - INSERT rows for the deterministic intent alias table
 *
 * Run: bun scripts/generate-intent-alias-seed.ts > /tmp/coverage.sql
 * The intent map in src/domains/estimating/pricing/intentMap.ts is the single
 * source of truth; this script only projects it into SQL.
 */
import { readFileSync } from "node:fs";
import { INTENT_RULES, normalizePhrase } from "../src/domains/estimating/pricing/intentMap";

const NEW_KEYS = [
  "permits.building.fee", "permits.electrical.fee", "permits.plumbing.fee",
  "permits.mechanical.fee", "permits.inspection.schedule",
  "framing.window.reframe", "framing.opening.infill", "framing.post.structural",
  "demo.door.remove", "demo.appliance.disconnect",
  "drywall.repair.area", "insulation.batt.floor",
  "electrical.device.relocate", "hvac.relocate.equipment",
  "painting.blend.touchup", "plumbing.rough.adjust", "flooring.patch.area",
  "bath.shower.waterproof.system", "bath.shower.niche", "bath.shower.glass.frameless",
  "trim.base.removereinstall",
];

const seed = readFileSync("supabase/seed/knowledge-base-v1.sql", "utf8");
const header = seed.match(/INSERT INTO public\.catalog_assemblies \(([^)]+)\) VALUES/);
if (!header) throw new Error("assembly insert header not found in seed file");

const rows = seed
  .split("\n")
  .filter((line) => line.startsWith("  (1, ") && NEW_KEYS.some((k) => line.includes(`'${k}'`)))
  .map((line) => line.replace(/,$/, ""));
if (rows.length !== NEW_KEYS.length) {
  throw new Error(`expected ${NEW_KEYS.length} coverage rows, found ${rows.length}`);
}

const q = (v: string | null | undefined) =>
  v === null || v === undefined ? "NULL" : `'${v.replace(/'/g, "''")}'`;

console.log(`INSERT INTO public.catalog_assemblies (${header[1]}) VALUES`);
console.log(rows.join(",\n"));
console.log("ON CONFLICT (library_version, assembly_key) DO NOTHING;\n");

const values: string[] = [];
for (const rule of INTENT_RULES) {
  const alias = normalizePhrase(rule.phrase);
  const priority = rule.priority ?? 100;
  if (rule.review) {
    values.push(
      `  (1, ${q(alias)}, ${q(rule.matchKind)}, NULL, 1, NULL, ${priority}, ${q(rule.review)}, ${q(rule.note)})`,
    );
    continue;
  }
  for (const c of rule.components ?? []) {
    values.push(
      `  (1, ${q(alias)}, ${q(rule.matchKind)}, ${q(c.assemblyKey)}, ${c.quantityFactor}, ${q(c.role)}, ${priority}, NULL, ${q(rule.note)})`,
    );
  }
}

console.log(
  "INSERT INTO public.catalog_intent_aliases\n" +
    "  (library_version, alias_norm, match_kind, assembly_key, quantity_factor, role, priority, review_reason, note) VALUES",
);
console.log(values.join(",\n"));
console.log("ON CONFLICT (library_version, alias_norm, COALESCE(assembly_key, '')) DO NOTHING;");
