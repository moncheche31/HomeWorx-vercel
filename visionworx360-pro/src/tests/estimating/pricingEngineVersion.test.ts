import { describe, expect, it } from "vitest";
import {
  PRICING_ENGINE_VERSION,
  shouldRepriceEstimate,
} from "@/domains/estimating/pricing/engineVersion";
import {
  BOOTSTRAP_RESOLUTION_TIMEOUT_MS,
  isResolutionTimeout,
  withTimeout,
} from "@/lib/async/withTimeout";

describe("detailed pricing staleness", () => {
  const base = {
    pricingEngineVersion: PRICING_ENGINE_VERSION,
    unmatchedLineCount: 0,
    isEditable: true,
    archived: false,
  };

  it("leaves a current, fully resolved draft alone", () => {
    expect(shouldRepriceEstimate(base)).toBe(false);
  });

  it("reprices a draft stamped by an older engine", () => {
    expect(shouldRepriceEstimate({ ...base, pricingEngineVersion: 0 })).toBe(true);
    expect(shouldRepriceEstimate({ ...base, pricingEngineVersion: null })).toBe(true);
  });

  it("retries lines the catalog previously failed to match", () => {
    expect(shouldRepriceEstimate({ ...base, unmatchedLineCount: 2 })).toBe(true);
  });

  it("never touches read-only or archived documents", () => {
    expect(shouldRepriceEstimate({ ...base, pricingEngineVersion: 0, isEditable: false })).toBe(false);
    expect(shouldRepriceEstimate({ ...base, unmatchedLineCount: 5, archived: true })).toBe(false);
  });
});

describe("bootstrap resolution budget", () => {
  it("fails with a coded timeout instead of hanging forever", async () => {
    const never = new Promise<string>(() => {});
    await expect(withTimeout(never, 5, "Workspace resolution")).rejects.toSatisfy(isResolutionTimeout);
  });

  it("passes through a value that resolves in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1000, "x")).resolves.toBe("ok");
    expect(BOOTSTRAP_RESOLUTION_TIMEOUT_MS).toBeGreaterThan(0);
  });
});
