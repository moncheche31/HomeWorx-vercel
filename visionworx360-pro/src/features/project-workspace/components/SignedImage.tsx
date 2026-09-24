import { useSignedImageQuery } from "../hooks/useProjectWorkspace";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageOff } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Fetches and displays a private storage image via cached short-lived signed URL. */
export function SignedImage({
  projectId,
  storagePath,
  alt,
  className,
  width,
  height,
}: {
  projectId: string;
  storagePath: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
}) {
  const { t } = useTranslation("pw");
  const q = useSignedImageQuery(projectId, storagePath);

  if (q.isError)
    return (
      <div
        className={
          (className ?? "") +
          " flex flex-col items-center justify-center gap-1 bg-muted text-xs text-foreground-muted"
        }
        role="img"
        aria-label={t("cover.imageUnavailable")}
      >
        <ImageOff className="size-5" aria-hidden />
        <span>{t("cover.imageUnavailable")}</span>
      </div>
    );
  if (!q.data)
    return <Skeleton className={className} />;
  return (
    <img
      src={q.data.url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      width={width}
      height={height}
    />
  );
}
