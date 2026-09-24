#!/usr/bin/env node
/**
 * Scans build output for legacy Lovable production backend identifiers and
 * real-looking Supabase keys. Run after `bun run build`:
 *
 *   node scripts/check-bundle-safety.mjs [dir=.output]
 *
 * Exits 1 when anything is found. The guard in src/lib/config/backendSafety.ts
 * stores only a hash, so a clean build must contain none of these.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2] ?? ".output";
if (!existsSync(dir)) {
  console.error(`check-bundle-safety: ${dir} does not exist; run the build first.`);
  process.exit(2);
}

const PATTERNS = [
  { name: "legacy Lovable production project ref", re: /lwybxokduogiewxciecq/ },
  { name: "Supabase publishable key", re: /sb_publishable_[A-Za-z0-9]{16,}/ },
  { name: "Supabase secret key", re: /sb_secret_[A-Za-z0-9]{16,}/ },
  { name: "Supabase JWT-style key", re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI/ },
];

const files = (d) =>
  readdirSync(d).flatMap((name) => {
    const path = join(d, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

const findings = [];
let scanned = 0;
for (const path of files(dir)) {
  if (!/\.(m?js|cjs|json|html|css|map|txt)$/.test(path)) continue;
  scanned += 1;
  const text = readFileSync(path, "utf8");
  for (const { name, re } of PATTERNS) if (re.test(text)) findings.push(`${relative(dir, path)}: ${name}`);
}

if (findings.length) {
  console.error(`check-bundle-safety: FOUND production identifiers/credentials in ${dir}:`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}
console.log(`check-bundle-safety: OK — ${scanned} files in ${dir}, no production identifiers or keys.`);
