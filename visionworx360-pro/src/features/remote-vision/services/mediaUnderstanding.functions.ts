import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getMediaUnderstandingSchema,
  saveMediaUnderstandingSchema,
} from "./mediaUnderstanding.shared";
import { loadMediaUnderstanding, persistMediaUnderstanding } from "./mediaUnderstanding.server";

export const getMediaUnderstanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getMediaUnderstandingSchema.parse(d))
  .handler(async ({ data, context }) => loadMediaUnderstanding(context.supabase, data.projectId));

export const saveMediaUnderstanding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveMediaUnderstandingSchema.parse(d))
  .handler(async ({ data, context }) =>
    persistMediaUnderstanding(context.supabase, context.userId, data.projectId, data.patch),
  );
