import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  applyDisplayPreferences,
  applyLargerTextToggle,
  isLargerTextOn,
  sanitizeDisplayPreferences,
  toPreferenceRow,
} from "./preferences";

describe("display preferences", () => {
  it("falls back to defaults for unknown input", () => {
    expect(sanitizeDisplayPreferences(null)).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(sanitizeDisplayPreferences({ textSize: "huge", density: "x" })).toEqual(
      DEFAULT_DISPLAY_PREFERENCES,
    );
  });

  it("accepts database row shape", () => {
    expect(
      sanitizeDisplayPreferences({
        text_size: "xlarge",
        display_density: "spacious",
        use_device_text_size: false,
      }),
    ).toEqual({ textSize: "xlarge", density: "spacious", useDeviceTextSize: false });
  });

  it("maps the quick Larger Text toggle without clobbering Extra Large", () => {
    const standard = { ...DEFAULT_DISPLAY_PREFERENCES };
    expect(isLargerTextOn(standard)).toBe(false);
    const on = applyLargerTextToggle(standard, true);
    expect(on.textSize).toBe("large");
    const xl = applyLargerTextToggle({ ...standard, textSize: "xlarge" }, true);
    expect(xl.textSize).toBe("xlarge");
    expect(applyLargerTextToggle(xl, false).textSize).toBe("standard");
  });

  it("writes tokens as data attributes", () => {
    const root = document.createElement("html");
    applyDisplayPreferences(
      { textSize: "large", density: "compact", useDeviceTextSize: false },
      root,
    );
    expect(root.getAttribute("data-text-size")).toBe("large");
    expect(root.getAttribute("data-density")).toBe("compact");
    expect(root.getAttribute("data-device-text")).toBe("off");
  });

  it("serializes to the persistence row", () => {
    expect(toPreferenceRow(DEFAULT_DISPLAY_PREFERENCES)).toEqual({
      text_size: "standard",
      display_density: "comfortable",
      use_device_text_size: true,
    });
  });
});
