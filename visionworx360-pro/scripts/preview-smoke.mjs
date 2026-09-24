import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const mode = process.argv[2] ?? "production";
const env = loadEnv(mode, process.cwd(), "VITE_");
const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

const missing = [];
for (const key of required) {
  if (!env[key]) env[key] = process.env[key];
  if (!env[key] && key === "VITE_SUPABASE_URL") env[key] = process.env.SUPABASE_URL;
  if (!env[key] && key === "VITE_SUPABASE_PUBLISHABLE_KEY") {
    env[key] = process.env.SUPABASE_PUBLISHABLE_KEY;
  }
  if (!env[key]) missing.push(key);
}
if (missing.length) {
  console.error(`[preview-smoke] Missing required env var(s): ${missing.join(", ")}. Aborting smoke test.`);
  process.exit(1);
}

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? javascriptFiles(path) : Promise.resolve(path.endsWith(".js") ? [path] : []);
    }),
  );
  return files.flat();
}

const files = await javascriptFiles(join(process.cwd(), "dist", "client"));
const clientCode = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");

for (const key of required) {
  if (!clientCode.includes(env[key])) {
    throw new Error(`[preview-smoke] ${key} was not inlined into generated client assets.`);
  }
}

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error } = await client.auth.signInWithPassword({
  email: `preview-smoke-${Date.now()}@invalid.example`,
  password: "preview-smoke-invalid-password",
});

if (!error) throw new Error("[preview-smoke] Expected the synthetic sign-in to be rejected.");
if (error.message.toLowerCase().includes("failed to fetch")) {
  throw new Error("[preview-smoke] signInWithPassword did not reach the authentication service.");
}

console.log("[preview-smoke] Public env, client assets, client initialization, and auth network path verified.");
