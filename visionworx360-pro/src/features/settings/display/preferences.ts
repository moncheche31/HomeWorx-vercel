/**
 * Accessibility & Display preferences.
 *
 * These preferences drive app-wide design tokens (text scale + density),
 * never one-off component styles. They are persisted per authenticated user
 * in `public.user_preferences` with a local-storage cache used for instant
 * (pre-network) application and as an offline fallback.
 */

export const TEXT_SIZES = ["standard", "large", "xlarge"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const DISPLAY_DENSITIES = ["compact", "comfortable", "spacious"] as const;
export type DisplayDensity = (typeof DISPLAY_DENSITIES)[number];

export interface DisplayPreferences {
  textSize: TextSize;
  density: DisplayDensity;
  useDeviceTextSize: boolean;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  textSize: "standard",
  density: "comfortable",
  useDeviceTextSize: true,
};

export const DISPLAY_PREFERENCES_STORAGE_KEY = "vwx.display-preferences";

function isTextSize(value: unknown): value is TextSize {
  return typeof value === "string" && (TEXT_SIZES as readonly string[]).includes(value);
}

function isDensity(value: unknown): value is DisplayDensity {
  return typeof value === "string" && (DISPLAY_DENSITIES as readonly string[]).includes(value);
}

/** Coerce any unknown shape (storage, database row) into valid preferences. */
export function sanitizeDisplayPreferences(input: unknown): DisplayPreferences {
  if (!input || typeof input !== "object") return { ...DEFAULT_DISPLAY_PREFERENCES };
  const raw = input as Record<string, unknown>;
  const textSize = raw["textSize"] ?? raw["text_size"];
  const density = raw["density"] ?? raw["display_density"];
  const useDevice = raw["useDeviceTextSize"] ?? raw["use_device_text_size"];
  return {
    textSize: isTextSize(textSize) ? textSize : DEFAULT_DISPLAY_PREFERENCES.textSize,
    density: isDensity(density) ? density : DEFAULT_DISPLAY_PREFERENCES.density,
    useDeviceTextSize:
      typeof useDevice === "boolean" ? useDevice : DEFAULT_DISPLAY_PREFERENCES.useDeviceTextSize,
  };
}

/** Quick toggle mapping: Larger Text off = standard, on = large (xlarge stays on). */
export function isLargerTextOn(prefs: DisplayPreferences): boolean {
  return prefs.textSize !== "standard";
}

export function applyLargerTextToggle(
  prefs: DisplayPreferences,
  on: boolean,
): DisplayPreferences {
  if (on) {
    return prefs.textSize === "standard" ? { ...prefs, textSize: "large" } : prefs;
  }
  return { ...prefs, textSize: "standard" };
}

export function readLocalDisplayPreferences(): DisplayPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_DISPLAY_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(DISPLAY_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES };
    return sanitizeDisplayPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export function writeLocalDisplayPreferences(prefs: DisplayPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISPLAY_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — preferences still apply for this session */
  }
}

/** Write the tokens the stylesheet reads. No inline styles anywhere else. */
export function applyDisplayPreferences(
  prefs: DisplayPreferences,
  root?: HTMLElement | null,
): void {
  const element = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!element) return;
  element.dataset["textSize"] = prefs.textSize;
  element.dataset["density"] = prefs.density;
  element.dataset["deviceText"] = prefs.useDeviceTextSize ? "on" : "off";
}

export function toPreferenceRow(prefs: DisplayPreferences) {
  return {
    text_size: prefs.textSize,
    display_density: prefs.density,
    use_device_text_size: prefs.useDeviceTextSize,
  };
}
