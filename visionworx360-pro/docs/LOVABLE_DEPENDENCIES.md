# Lovable dependency boundary

This page records every place Lovable is still involved, as of Phase 2A
(2026-09-24). Each item is classified as one of:

- **ALREADY INDEPENDENT**
- **KEEP TEMPORARILY**
- **REPLACE IN LATER PHASE**
- **REMOVE**

A package isn't marked for removal just because its name contains "lovable":
`@lovable.dev/*` packages are public on npm and work outside Lovable.

| # | Item | Where | Classification | Notes |
|---|---|---|---|---|
| 1 | Supabase connection | `src/lib/config/*`, `src/integrations/supabase/*`, `src/lib/supabase/*`, `src/lib/mcp/supabase.ts` | **ALREADY INDEPENDENT** (Phase 2A) | The hardcoded production fallback (`managed-public-config.ts`) was deleted. Configuration comes only from env and fails closed. The legacy production project is refused outside explicit `VITE_APP_ENV=production` and always in tests. The *data* is still in Lovable Cloud (Phase 2B). |
| 2 | Lovable AI Gateway: chat completions | `assemblyMaterialEstimate.server.ts`, `narrationEstimator.server.ts`, `assemblyExpansion.server.ts` (features/estimating/services); `visionUnderstanding.server.ts`, `measurementCapture.server.ts` (features/remote-vision/services) | **REPLACE IN LATER PHASE** | `https://ai.gateway.lovable.dev/v1/chat/completions`, OpenAI-compatible |
| 3 | Gemini models | the same 5 files | **REPLACE IN LATER PHASE** | `google/gemini-3-flash` (×3), `google/gemini-3.6-flash`, `google/gemini-3.7-flash`. These are gateway model ids; map them to a direct provider's ids. |
| 4 | Transcription | `src/routes/api/transcribe.ts`; the assertion in `src/tests/walkthrough/dictationFallback.test.ts` | **REPLACE IN LATER PHASE** | `…/v1/audio/transcriptions`, model `openai/gpt-4o-mini-transcribe`. The test pins the gateway URL. |
| 5 | AI gateway key `LOVABLE_API_KEY` | 6 call sites | **REPLACE IN LATER PHASE** | The AI features fail without it; everything else works. Also see #9 (MCP usage metrics). |
| 6 | Preview login storage | `src/integrations/supabase/previewAuthStorage.ts`, used by `src/integrations/supabase/client.ts` | **REMOVE** (later cleanup) | Only active on `lovableproject.com`, `lovable.app`, `gpt-eng.com` and similar hosts; inert elsewhere. |
| 7 | Editor error reporting | `src/lib/lovable-error-reporting.ts`, called from `src/routes/__root.tsx` | **REMOVE** (later cleanup) | A no-op unless the Lovable editor injects `window.__lovableEvents`. Swap for a real error sink when one is chosen. |
| 8 | MCP server | `@lovable.dev/mcp-js`; `src/lib/mcp/*`; `src/routes/mcp.ts`, `src/routes/[.mcp]/*` and `src/routes/[.well-known]/oauth-protected-resource.ts` (auto-generated); `mcpPlugin()` in `vite.config.ts`; `.lovable/mcp/manifest.json` | **KEEP TEMPORARILY** | Read-only MCP tools over the user's own data, authenticated by the project's **own** Supabase OAuth issuer (`VITE_SUPABASE_PROJECT_ID`). **Heads-up:** the package sends tool-usage metrics to `api.lovable.dev/internal/v1/app-mcp-usage` whenever `LOVABLE_API_KEY` is set (it self-disables otherwise). Decide in a later phase whether to keep MCP; if it stays, pass `metrics: false` to `defineMcp`. `.lovable/mcp/manifest.json` is Lovable-side metadata; it still names the legacy production issuer and nothing in the build reads it. |
| 9 | OAuth consent page | `src/routes/[.]lovable.oauth.consent.tsx` (route `/.lovable/oauth/consent`) | **KEEP TEMPORARILY** | Uses Supabase's OAuth server. Only the path is Lovable-branded. It stays or goes with #8. |
| 10 | Build configuration | `@lovable.dev/vite-tanstack-config` in `vite.config.ts` | **KEEP TEMPORARILY** | Public npm package and builds offline. It bundles TanStack Start, React, Tailwind, tsconfig-paths and nitro (Cloudflare preset). It contains no Lovable URLs. Its "sandbox detection" makes the dev server bind to `::` (use `--host 127.0.0.1` where IPv6 is unavailable). Replace with an explicit Vite config when convenient. |
| 11 | Package registry / lockfile | `bun.lock`, `bunfig.toml` | **ALREADY INDEPENDENT** | The lockfile points at registry.npmjs.org (Phase 1). `bunfig.toml` keeps a harmless release-age exclusion list naming `@lovable.dev/*` packages. |
| 12 | Hosting / deployment / preview URLs | Lovable publish, `*.lovable.app` | **REPLACE IN LATER PHASE** | The build output is a nitro Cloudflare Worker (`.output/`, `wrangler.json`). Nothing in the code refers to the preview URLs. |
| 13 | Brand logo assets | `src/assets/visionworx360-logo.png.asset.json`, `src/assets/homeworx360-logo.png.asset.json`, used by `BrandMark.tsx` | **REPLACE IN LATER PHASE** | They point at Lovable's asset CDN (`/__l5e/assets-v1/…`), so the logos don't render when self-hosted. Obtain the two PNGs (650 KB each) from the Lovable editor or a GitHub export and commit them. |
| 14 | Favicon | `public/favicon.ico` (missing) | **REPLACE IN LATER PHASE** | Unretrievable in Phase 1 (binary). Same source as #13. |
| 15 | Agent guidance and history | `AGENTS.md` (Lovable sync banner removed in Phase 2A), `.lovable/plan*.md`, `.lovable/project.json` | **KEEP TEMPORARILY** | `.lovable/plan/` holds 14 forensic and audit plans from the Lovable era; archive them under `docs/history/` later. |
| 16 | Supabase CLI project id | `supabase/config.toml` | **ALREADY INDEPENDENT** (Phase 2A) | Was the production project ref; now `visionworx360-pro`. |
| 17 | Generated Supabase integration files | `src/integrations/supabase/{client,client.server,auth-middleware,auth-attacher,types}.ts` | **ALREADY INDEPENDENT** | Standard supabase-js code. Error messages no longer say "Connect Supabase in Lovable Cloud". |
| 18 | Docs mentioning Lovable | `docs/build-log/BUILD_LOG.md`, `docs/decisions/ADR-011…015`, `ADR-064`, `README`s | **KEEP** | Historical record |
