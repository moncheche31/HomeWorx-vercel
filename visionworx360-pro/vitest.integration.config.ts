import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

/*
 * Real-database integration suites. Run through scripts/integration-harness/run.sh,
 * which starts local Postgres + PostgREST and replays supabase/migrations.
 * Without that boundary every test FAILS with "BLOCKED:" — never skips.
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/tests/integration/pricingInheritance/**/*.test.ts"],
    setupFiles: ["./src/tests/setup.ts"],
  },
});
