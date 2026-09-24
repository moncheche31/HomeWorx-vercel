import { useTranslation } from "react-i18next";
import { AccessibilityDisplaySettings } from "../components/AccessibilityDisplaySettings";

export function SettingsPage() {
  const { t } = useTranslation("settings");
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-(--density-gap)">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("description")}</p>
      </header>
      <AccessibilityDisplaySettings />
    </div>
  );
}
