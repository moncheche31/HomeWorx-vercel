import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDisplayPreferences } from "../display/DisplayPreferencesProvider";
import {
  DISPLAY_DENSITIES,
  TEXT_SIZES,
  isLargerTextOn,
  type DisplayDensity,
  type TextSize,
} from "../display/preferences";

function OptionRow({
  selected,
  label,
  description,
  onSelect,
}: {
  selected: boolean;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full min-h-(--control-min-h) items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-surface text-foreground hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 size-5 shrink-0 rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-border",
        )}
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-foreground-muted">{description}</span>
      </span>
    </button>
  );
}

export function AccessibilityDisplaySettings() {
  const { t } = useTranslation("settings");
  const { preferences, persistence, update, setLargerText, reset } = useDisplayPreferences();

  return (
    <section className="space-y-(--density-gap)" aria-labelledby="accessibility-display-heading">
      <Card>
        <CardHeader>
          <CardTitle id="accessibility-display-heading">{t("display.title")}</CardTitle>
          <CardDescription>{t("display.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-(--density-gap)">
          <div className="flex min-h-(--control-min-h) flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="quick-larger-text" className="text-base font-semibold">
                {t("display.quickToggle.label")}
              </Label>
              <p className="text-sm text-foreground-muted">{t("display.quickToggle.hint")}</p>
            </div>
            <Switch
              id="quick-larger-text"
              checked={isLargerTextOn(preferences)}
              onCheckedChange={setLargerText}
              aria-label={t("display.quickToggle.label")}
            />
          </div>

          <fieldset className="space-y-2" role="radiogroup" aria-label={t("display.textSize.label")}>
            <legend className="mb-1 text-base font-semibold">{t("display.textSize.label")}</legend>
            {TEXT_SIZES.map((size: TextSize) => (
              <OptionRow
                key={size}
                selected={preferences.textSize === size}
                label={t(`display.textSize.options.${size}.label`)}
                description={t(`display.textSize.options.${size}.description`)}
                onSelect={() => update({ textSize: size })}
              />
            ))}
          </fieldset>

          <fieldset className="space-y-2" role="radiogroup" aria-label={t("display.density.label")}>
            <legend className="mb-1 text-base font-semibold">{t("display.density.label")}</legend>
            {DISPLAY_DENSITIES.map((density: DisplayDensity) => (
              <OptionRow
                key={density}
                selected={preferences.density === density}
                label={t(`display.density.options.${density}.label`)}
                description={t(`display.density.options.${density}.description`)}
                onSelect={() => update({ density })}
              />
            ))}
          </fieldset>

          <div className="flex min-h-(--control-min-h) flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="use-device-text-size" className="text-base font-semibold">
                {t("display.deviceTextSize.label")}
              </Label>
              <p className="text-sm text-foreground-muted">{t("display.deviceTextSize.hint")}</p>
            </div>
            <Switch
              id="use-device-text-size"
              checked={preferences.useDeviceTextSize}
              onCheckedChange={(checked) => update({ useDeviceTextSize: checked })}
              aria-label={t("display.deviceTextSize.label")}
            />
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
            <p className="text-base font-semibold">{t("display.preview.title")}</p>
            <p className="text-sm text-foreground-muted">{t("display.preview.body")}</p>
            <Button className="w-full sm:w-auto">{t("display.preview.action")}</Button>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground-muted">
              {persistence === "server"
                ? t("display.persistence.server")
                : t("display.persistence.local")}
            </p>
            <Button variant="outline" className="w-full sm:w-auto" onClick={reset}>
              {t("display.reset")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
