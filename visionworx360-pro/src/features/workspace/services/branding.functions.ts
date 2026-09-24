import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  BRANDING_BUCKET,
  LOGO_EXTENSIONS,
  logoUploadTicketSchema,
  setLogoSchema,
} from "./branding.shared";

type StorageBucket = {
  createSignedUploadUrl: (
    path: string,
  ) => Promise<{ data: { signedUrl: string; token: string } | null; error: unknown }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
};
type SB = {
  from: (table: string) => never;
  rpc: (name: string) => Promise<{ data: unknown; error: unknown }>;
  storage: { from: (bucket: string) => StorageBucket };
};

const errMessage = (e: unknown, fallback: string) =>
  (e as { message?: string })?.message ?? fallback;

/** The caller's active organization, derived server-side — never client-supplied. */
async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error(errMessage(error, "No active organization"));
  if (!data) throw new Error("No active organization");
  return data as string;
}

/** Every branding object lives under `<organization_id>/…`; storage RLS agrees. */
function assertOwnedPath(orgId: string, path: string) {
  if (!path.startsWith(`${orgId}/`) || path.includes("..")) {
    throw new Error("Invalid storage path");
  }
}

/**
 * Signed PUT ticket for a new logo object. The object name is a fresh uuid on
 * every upload, so a replaced logo can never be served from a stale cache.
 */
export const createLogoUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => logoUploadTicketSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ storagePath: string; signedUrl: string; token: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const ext = LOGO_EXTENSIONS[data.contentType];
    const storagePath = `${org}/logo-${crypto.randomUUID()}.${ext}`;
    const { data: ticket, error } = await sb.storage
      .from(BRANDING_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !ticket) throw new Error(errMessage(error, "Failed to create upload ticket"));
    return { storagePath, signedUrl: ticket.signedUrl, token: ticket.token };
  });

/**
 * Point the canonical `organizations.logo_url` at a freshly uploaded object and
 * delete the previous one. There is no second logo store: proposals, company
 * settings and everything else read this single column.
 */
export const setOrganizationLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setLogoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ logoUrl: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    assertOwnedPath(org, data.storagePath);

    const client = context.supabase;
    const { data: previous } = await client
      .from("organizations")
      .select("logo_url")
      .eq("id", org)
      .maybeSingle();

    const { error } = await client
      .from("organizations")
      .update({ logo_url: data.storagePath } as never)
      .eq("id", org);
    if (error) throw new Error(errMessage(error, "Failed to save logo"));

    const old = (previous as { logo_url?: string | null } | null)?.logo_url ?? null;
    if (old && old !== data.storagePath && old.startsWith(`${org}/`)) {
      await sb.storage.from(BRANDING_BUCKET).remove([old]);
    }
    return { logoUrl: data.storagePath };
  });

/** Clear the company logo and remove the stored object. */
export const removeOrganizationLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ logoUrl: null }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const client = context.supabase;
    const { data: previous } = await client
      .from("organizations")
      .select("logo_url")
      .eq("id", org)
      .maybeSingle();
    const { error } = await client
      .from("organizations")
      .update({ logo_url: null } as never)
      .eq("id", org);
    if (error) throw new Error(errMessage(error, "Failed to remove logo"));
    const old = (previous as { logo_url?: string | null } | null)?.logo_url ?? null;
    if (old && old.startsWith(`${org}/`)) {
      await sb.storage.from(BRANDING_BUCKET).remove([old]);
    }
    return { logoUrl: null };
  });

/** Short-lived signed URL for displaying the private logo object. */
export const getOrganizationLogoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setLogoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    assertOwnedPath(org, data.storagePath);
    const { data: signed, error } = await sb.storage
      .from(BRANDING_BUCKET)
      .createSignedUrl(data.storagePath, 3600);
    if (error || !signed) throw new Error(errMessage(error, "Failed to sign logo url"));
    return { url: signed.signedUrl };
  });
