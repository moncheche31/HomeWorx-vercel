import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESTIMATE_COPY_OPTIONS,
  buildCopyProvenanceLabel,
  isCopyableField,
  isPricingRefreshEligible,
  NEVER_COPIED_FIELDS,
  normalizeCopyOptions,
  normalizePricingCopyMode,
  refreshableLineIds,
  sanitizeForTemplate,
} from "@/domains/estimating/copyPlan";

/**
 * Copying a prior project is an explicit contractor action, and it must never
 * carry customer identity, transactional history, or media into a new job.
 */
describe("estimate copy plan", () => {
  it("never copies identity, approval, payment or media fields", () => {
    const source = {
      title: "Kitchen remodel",
      client_id: "client-1",
      approved_at: "2026-01-01",
      signature_url: "https://example.test/sig.png",
      quantity: 12,
    };
    const copied = sanitizeForTemplate(source);
    for (const field of NEVER_COPIED_FIELDS) {
      expect(isCopyableField(field)).toBe(false);
      expect(copied).not.toHaveProperty(field);
    }
    expect(copied.title).toBe("Kitchen remodel");
    expect(copied.quantity).toBe(12);
  });

  it("defaults to copying scope and pricing but nothing identifying", () => {
    expect(DEFAULT_ESTIMATE_COPY_OPTIONS.copyScope).toBe(true);
    expect(DEFAULT_ESTIMATE_COPY_OPTIONS.copyLines).toBe(true);
    expect(normalizeCopyOptions({ copyPricing: false })).toMatchObject({
      copyPricing: false,
      copyScope: true,
    });
  });

  it("labels provenance with the source project and date", () => {
    expect(
      buildCopyProvenanceLabel("Jackie's Kitchen", "2026-08-12T10:00:00Z"),
    ).toContain("Jackie's Kitchen");
  });

  it("refreshes only untouched copied pricing, never contractor edits", () => {
    const lines = [
      { id: "a", pricingSource: "copied" },
      { id: "b", pricingSource: "contractor" },
      { id: "c", pricingSource: "system" },
    ];
    expect(isPricingRefreshEligible(lines[0]!)).toBe(true);
    expect(isPricingRefreshEligible(lines[1]!)).toBe(false);
    expect(refreshableLineIds(lines)).toEqual(["a"]);
  });

  it("normalizes the pricing copy mode", () => {
    expect(normalizePricingCopyMode("copied")).toBe("copied");
    expect(normalizePricingCopyMode("refreshed")).toBe("refreshed");
    expect(normalizePricingCopyMode("nonsense")).toBeNull();
  });
});
