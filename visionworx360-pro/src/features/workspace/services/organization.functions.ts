import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveOrgSchema } from "./organization.shared";
import { resolveMyWorkspace, saveMyOrganization } from "./organization.server";

export const getMyOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => resolveMyWorkspace(context.supabase, context.userId));

export const saveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveOrgSchema.parse(d))
  .handler(async ({ data, context }) => saveMyOrganization(context.supabase, context.userId, data));
