import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon, ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InlineError } from "@/components/feedback/InlineError";
import { toast } from "sonner";
import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from "../services/branding.shared";
import { useCompanyLogoMutations, useCompanyLogoUrl } from "../hooks/useCompanyLogo";

/**
 * Company logo management for proposal branding. Writes to the canonical
 * `organizations.logo_url`, which the proposal builder already reads.
 */
export function CompanyLogoCard({
  logoValue,
  onChanged,
}: {
  logoValue: string | null;
  onChanged: () => Promise<unknown> | void;
}) {
  const { t } = useTranslation("workspace");
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { url, isLoading, isError } = useCompanyLogoUrl(logoValue);
  const { upload, remove } = useCompanyLogoMutations(onChanged);
  const busy = upload.isPending || remove.isPending;

  const pick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const result = await upload.mutateAsync(file).catch(() => ({ error: "upload" as const }));
    if (result.error === "type") {
      setError(t("organization.logo.errors.type"));
    } else if (result.error === "size") {
      setError(
        t("organization.logo.errors.size", { max: Math.round(LOGO_MAX_BYTES / (1024 * 1024)) }),
      );
    } else if (result.error) {
      setError(t("organization.logo.errors.upload"));
    } else {
      toast.success(t("organization.logo.savedToast"));
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="size-4 text-primary" aria-hidden />
          {t("organization.logo.title")}
        </CardTitle>
        <CardDescription>{t("organization.logo.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface"
          aria-live="polite"
        >
          {isLoading ? (
            <Loader2 className="size-5 animate-spin text-foreground-muted" aria-hidden />
          ) : url && !isError ? (
            <img
              src={url}
              alt={t("organization.logo.previewAlt")}
              className="size-full object-contain p-2"
            />
          ) : logoValue && isError ? (
            <div className="flex flex-col items-center gap-1 px-1 text-center text-xs text-foreground-muted">
              <ImageOff className="size-5" aria-hidden />
              {t("organization.logo.unavailable")}
            </div>
          ) : (
            <span className="px-2 text-center text-xs text-foreground-muted">
              {t("organization.logo.empty")}
            </span>
          )}
        </div>

        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" className="min-h-11" onClick={pick} disabled={busy}>
              <Upload className="mr-2 size-4" aria-hidden />
              {logoValue ? t("organization.logo.replace") : t("organization.logo.upload")}
            </Button>
            {logoValue ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={async () => {
                  setError(null);
                  try {
                    await remove.mutateAsync();
                    toast.success(t("organization.logo.removedToast"));
                  } catch {
                    setError(t("organization.logo.errors.upload"));
                  }
                }}
              >
                <Trash2 className="mr-2 size-4" aria-hidden />
                {t("organization.logo.remove")}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-foreground-muted">
            {t("organization.logo.hint", { max: Math.round(LOGO_MAX_BYTES / (1024 * 1024)) })}
          </p>
          {error ? (
            <div role="alert" aria-live="polite">
              <InlineError message={error} />
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            accept={LOGO_MIME_TYPES.join(",")}
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </CardContent>
    </Card>
  );
}
