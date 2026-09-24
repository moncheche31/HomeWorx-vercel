import { z } from "zod";

/**
 * Company logo upload rules.
 *
 * SVG is deliberately excluded: SVG is an executable document format and the
 * logo is rendered inline in client-facing proposals, so allowing it would
 * open a stored-XSS path. Raster web formats only.
 */
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const LOGO_EXTENSIONS: Record<(typeof LOGO_MIME_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
/** 3 MB — comfortably above any sane logo, small enough to keep proposals fast. */
export const LOGO_MAX_BYTES = 3 * 1024 * 1024;

export const BRANDING_BUCKET = "org-branding";

export const logoUploadTicketSchema = z.object({
  contentType: z.enum(LOGO_MIME_TYPES),
  fileSize: z.number().int().positive().max(LOGO_MAX_BYTES),
});

export const setLogoSchema = z.object({
  storagePath: z.string().trim().min(1).max(400),
});

export type LogoValidationError = "type" | "size";

/** Client-side guard mirroring the server rules, so users get an instant error. */
export function validateLogoFile(file: {
  type: string;
  size: number;
}): LogoValidationError | null {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > LOGO_MAX_BYTES || file.size === 0) return "size";
  return null;
}

/**
 * A stored logo is an object path inside the private `org-branding` bucket.
 * Legacy/manually-set absolute URLs are still honoured for display.
 */
export function isStoragePath(value: string | null | undefined): boolean {
  if (!value) return false;
  return !/^https?:\/\//i.test(value) && !value.startsWith("data:");
}
