import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // Needs local Postgres + PostgREST: run with `bun run test:integration`.
    exclude: [...configDefaults.exclude, "src/tests/integration/pricingInheritance/**"],
    setupFiles: ["./src/tests/setup.ts"],
  },
});
