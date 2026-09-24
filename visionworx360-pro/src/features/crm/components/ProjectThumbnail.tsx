import { useTranslation } from "react-i18next";
import { ImageIcon } from "lucide-react";
import { SignedImage } from "@/features/project-workspace/components/SignedImage";

/**
 * Landscape thumbnail for project cards. Renders a signed private-storage image
 * when available, otherwise a branded placeholder. Fixed 16:9 aspect prevents CLS.
 */
export function ProjectThumbnail({
  projectId,
  storagePath,
  alt,
  projectName,
}: {
  projectId: string;
  storagePath: string | null;
  alt: string | null;
  projectName: string;
}) {
  const { t } = useTranslation("pw");
  const effectiveAlt = alt?.trim() || projectName;
  if (storagePath) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
        <SignedImage
          projectId={projectId}
          storagePath={storagePath}
          alt={effectiveAlt}
          className="h-full w-full object-cover"
          width={640}
          height={360}
        />
      </div>
    );
  }
  return (
    <div
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-t-lg bg-gradient-to-br from-primary/10 via-secondary to-accent/10 text-foreground-muted"
      role="img"
      aria-label={t("cover.noPhoto")}
    >
      <ImageIcon className="size-8 opacity-70" aria-hidden />
      <span className="text-xs font-medium uppercase tracking-wide">
        {t("cover.noPhoto")}
      </span>
    </div>
  );
}
