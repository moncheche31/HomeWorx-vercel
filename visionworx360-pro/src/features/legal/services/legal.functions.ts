import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const acceptanceSchema = z.object({
  locale: z.string().trim().max(16).optional(),
  documents: z
    .array(
      z.object({
        documentKey: z.string().trim().min(1).max(64),
        documentVersion: z.string().trim().min(1).max(32),
      }),
    )
    .min(1)
    .max(10),
});

/**
 * Persist legal acceptance for the signed-in user.
 *
 * Idempotent: the table has a unique (user, key, version) constraint, so a
 * repeated signup/onboarding pass never duplicates the record.
 */
export const recordLegalAcceptance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => acceptanceSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ recorded: number }> => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();

    const rows = data.documents.map((doc) => ({
      user_id: context.userId,
      organization_id: (profile as { organization_id?: string | null } | null)?.organization_id ?? null,
      document_key: doc.documentKey,
      document_version: doc.documentVersion,
      locale: data.locale ?? null,
    }));

    const { data: inserted, error } = await context.supabase
      .from("legal_acceptances")
      .upsert(rows as never, {
        onConflict: "user_id,document_key,document_version",
        ignoreDuplicates: true,
      })
      .select("id");
    if (error) throw new Error(error.message);
    return { recorded: (inserted ?? []).length };
  });

/** Acceptance records for the signed-in user (audit / support surface). */
export const listMyLegalAcceptances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("legal_acceptances")
      .select("document_key, document_version, accepted_at, locale")
      .eq("user_id", context.userId)
      .order("accepted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Record<string, unknown>) => ({
      documentKey: String(r.document_key),
      documentVersion: String(r.document_version),
      acceptedAt: String(r.accepted_at),
      locale: (r.locale as string | null) ?? null,
    }));
  });
