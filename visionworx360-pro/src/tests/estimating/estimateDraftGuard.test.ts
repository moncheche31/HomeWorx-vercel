/**
 * Regression coverage: switching estimate versions while line-price edits are
 * still in their draft (pre-blur) state used to discard them silently.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import enEstimating from "@/i18n/locales/en-US/estimating.json";
import esEstimating from "@/i18n/locales/es-US/estimating.json";

const source = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");

describe("estimate version switch", () => {
  it("confirms before discarding unsaved line-price drafts", () => {
    const handler = source.slice(source.indexOf("onValueChange={(v) => {"));
    const body = handler.slice(0, handler.indexOf("}}"));
    expect(body).toContain("Object.keys(drafts).length > 0");
    expect(body).toContain("window.confirm");
    // The discard must not run when the contractor cancels.
    expect(body.indexOf("return;")).toBeLessThan(body.indexOf("setSelectedId(v)"));
  });

  it("has the warning copy in both supported locales", () => {
    expect(enEstimating.unsavedDraftsSwitch).toBeTruthy();
    expect(esEstimating.unsavedDraftsSwitch).toBeTruthy();
    expect(esEstimating.unsavedDraftsSwitch).not.toBe(enEstimating.unsavedDraftsSwitch);
  });
});
