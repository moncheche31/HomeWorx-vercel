import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getNarrativeScopeSchema, saveNarrativeScopeSchema } from "./narrativeScope.shared";
import { loadNarrativeScope, persistNarrativeScope } from "./narrativeScope.server";

export const getNarrativeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getNarrativeScopeSchema.parse(d))
  .handler(async ({ data, context }) => loadNarrativeScope(context.supabase, data.projectId));

export const saveNarrativeScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveNarrativeScopeSchema.parse(d))
  .handler(async ({ data, context }) =>
    persistNarrativeScope(context.supabase, context.userId, data.projectId, data.patch),
  );
