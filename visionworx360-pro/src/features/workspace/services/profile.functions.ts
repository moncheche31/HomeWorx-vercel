import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveProfileSchema } from "./profile.shared";
import { saveMyProfile, syncMyProfileEmail } from "./profile.server";

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveProfileSchema.parse(d))
  .handler(async ({ data, context }) => saveMyProfile(context.supabase, context.userId, data));

/**
 * Copy the verified account email from the bearer-token claims onto the
 * profile mirror. Takes no input, so a caller cannot set an arbitrary email.
 */
export const syncAccountEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const claims = context.claims as { email?: unknown };
    const email = typeof claims.email === "string" ? claims.email : null;
    return syncMyProfileEmail(context.supabase, context.userId, email);
  });
