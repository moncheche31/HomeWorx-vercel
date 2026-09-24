import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Support / problem reports.
 *
 * Diagnostics are deliberately narrow: route, app version, timestamp and the
 * error correlation id. No tokens, no passwords, no customer record content.
 */
const submitSchema = z.object({
  category: z.enum(["problem", "question", "feedback"]).default("problem"),
  message: z.string().trim().max(4000).optional(),
  contactPreference: z.enum(["email", "phone", "none"]).default("email"),
  contactValue: z.string().trim().max(200).optional(),
  referenceId: z.string().trim().max(64).optional(),
  route: z.string().trim().max(300).optional(),
  appVersion: z.string().trim().max(64).optional(),
  locale: z.string().trim().max(16).optional(),
  occurredAt: z.string().trim().max(40).optional(),
});

export const submitSupportRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ referenceId: string }> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    const organizationId =
      ((profile ?? null) as { organization_id?: string | null } | null)?.organization_id ?? null;

    const referenceId =
      data.referenceId && data.referenceId.length > 0
        ? data.referenceId
        : `SR-${Date.now().toString(36).toUpperCase()}`;

    const { error } = await context.supabase.from("support_requests").insert({
      organization_id: organizationId,
      user_id: context.userId,
      category: data.category,
      message: data.message ?? null,
      contact_preference: data.contactPreference,
      contact_value: data.contactValue ?? null,
      reference_id: referenceId,
      route: data.route ?? null,
      app_version: data.appVersion ?? null,
      diagnostics: {
        locale: data.locale ?? null,
        occurredAt: data.occurredAt ?? new Date().toISOString(),
      },
    } as never);
    if (error) throw new Error(error.message);
    return { referenceId };
  });
