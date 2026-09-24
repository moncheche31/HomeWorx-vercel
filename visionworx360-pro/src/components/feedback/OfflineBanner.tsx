import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface OfflineBannerProps {
  message?: string;
  className?: string;
}

export function OfflineBanner({ message, className }: OfflineBannerProps) {
  const { t } = useTranslation("status");
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center justify-center gap-2 border-t border-border bg-warning/20 px-4 py-2 text-sm font-medium text-foreground",
        className,
      )}
    >
      <WifiOff className="size-4" aria-hidden />
      <span>{message ?? t("offline.banner")}</span>
    </div>
  );
}
