// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { loadEnv, type ConfigEnv } from "vite";
import { devServerConfigProblems } from "./src/lib/config/backendSafety";

export default async function config(configEnv: ConfigEnv) {
  // Fail closed: `vite dev` never starts without an explicit, non-production
  // Supabase configuration. There is no built-in backend fallback.
  if (configEnv.command === "serve" && !configEnv.isPreview) {
    const problems = devServerConfigProblems(loadEnv(configEnv.mode, process.cwd(), ""));
    if (problems.length > 0) {
      throw new Error(
        [
          "VisionWorx dev server refused to start — Supabase configuration is missing or unsafe:",
          ...problems.map((problem) => `  - ${problem}`),
          "Copy .env.example to .env.local and point it at a development Supabase project.",
        ].join("\n"),
      );
    }
  }

  const createConfig = defineConfig({
    tanstackStart: {
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      // nitro/vite builds from this
      server: { entry: "server" },
    },
    vite: {
      plugins: [mcpPlugin()],
    },
  });


  return createConfig(configEnv);
}
