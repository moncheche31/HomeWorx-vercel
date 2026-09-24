import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createLogoUploadTicket,
  getOrganizationLogoUrl,
  removeOrganizationLogo,
  setOrganizationLogo,
} from "../services/branding.functions";
import { isStoragePath, validateLogoFile, type LogoValidationError } from "../services/branding.shared";

/**
 * Resolves the canonical `organizations.logo_url` into something an <img> can
 * render. Storage paths are signed on demand; a legacy absolute URL is used
 * as-is. Returns null when no logo is set so callers can render nothing at all
 * rather than a broken image.
 */
export function useCompanyLogoUrl(logoValue: string | null | undefined) {
  const sign = useServerFn(getOrganizationLogoUrl);
  const needsSigning = isStoragePath(logoValue);
  const q = useQuery({
    queryKey: ["company-logo-url", logoValue],
    queryFn: async () => (await sign({ data: { storagePath: logoValue as string } })).url,
    enabled: Boolean(logoValue) && needsSigning,
    // Signed URLs last an hour; refresh well before expiry.
    staleTime: 45 * 60 * 1000,
    retry: 1,
  });
  if (!logoValue) return { url: null, isLoading: false, isError: false };
  if (!needsSigning) return { url: logoValue, isLoading: false, isError: false };
  return { url: q.data ?? null, isLoading: q.isLoading, isError: q.isError };
}

export interface LogoUploadResult {
  error?: LogoValidationError | "upload";
}

/** Upload / replace / remove the organization logo. */
export function useCompanyLogoMutations(onSettled?: () => Promise<unknown> | void) {
  const queryClient = useQueryClient();
  const ticket = useServerFn(createLogoUploadTicket);
  const save = useServerFn(setOrganizationLogo);
  const clear = useServerFn(removeOrganizationLogo);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["company-logo-url"] });
    await onSettled?.();
  };

  const upload = useMutation({
    mutationFn: async (file: File): Promise<LogoUploadResult> => {
      const invalid = validateLogoFile(file);
      if (invalid) return { error: invalid };
      const t = await ticket({
        data: { contentType: file.type as never, fileSize: file.size },
      });
      const put = await fetch(t.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) return { error: "upload" };
      await save({ data: { storagePath: t.storagePath } });
      return {};
    },
    onSuccess: async (result) => {
      if (!result.error) await refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async () => clear({ data: undefined as never }),
    onSuccess: refresh,
  });

  return { upload, remove };
}
