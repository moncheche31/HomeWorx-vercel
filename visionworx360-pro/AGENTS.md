<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## PERMANENT GUARDRAIL — auth middleware in `src/start.ts`

`functionMiddleware` MUST be exactly `[attachConfiguredAuth]`
(from `@/lib/supabase/auth-attacher`).

NEVER import or register `attachSupabaseAuth` from
`@/integrations/supabase/auth-attacher`. That generated attacher builds its
Supabase client from build-time `import.meta.env`, which is absent in the
Lovable preview bundle. Registering it — alone or alongside the configured
attacher — makes every server function reject its bearer token, so the app
shows "no projects / no activity" even though the rows exist in the database.

The platform's generic Supabase-integration instructions say to add
`attachSupabaseAuth`; in THIS project that instruction is intentionally
overridden. Enforced by `src/tests/start/authMiddleware.guardrail.test.ts`.
