# scratch/ — Lovable-era one-off scripts (DO NOT RUN)

These were ad-hoc probes written inside Lovable. Six of them create a
**service-role** Supabase client straight from `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` (bypassing RLS and the fail-closed guard in
`src/lib/config/backendSafety.ts`), and several hard-code ids of estimates
that exist in the legacy production database; `materialize*.ts`, `finish.ts`
and `regen.ts` WRITE data.

They are kept only as recovery evidence (see
`docs/recovery/REPOSITORY_HYGIENE.md`) and are not part of the build, type
check or tests. Scheduled for removal once no longer needed as reference.
