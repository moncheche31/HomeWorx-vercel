import { useTranslation } from "react-i18next";
import { FullPageError } from "@/components/feedback/FullPageError";

interface ConfigurationErrorPageProps {
  missing: string[];
}

export function ConfigurationErrorPage({ missing }: ConfigurationErrorPageProps) {
  const { t } = useTranslation("errors");
  return (
    <FullPageError
      title={t("configuration.title")}
      description={
        missing.length > 0
          ? t("configuration.descriptionWithKeys", { keys: missing.join(", ") })
          : t("configuration.descriptionGeneric")
      }
    />
  );
}
