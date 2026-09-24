import { describe, expect, it } from "vitest";
import {
  crewDuration,
  crewSizeForTrade,
  DEFAULT_CREW_SIZE,
  PRODUCTIVE_HOURS_PER_DAY,
} from "@/domains/estimating/crewDuration";

describe("crew-hours to calendar duration", () => {
  it("reads 225 roofing crew-hours as a one-week job, not 5.6 weeks", () => {
    const d = crewDuration({ crewHours: 225, tradeKey: "roofing" });
    expect(d.crewSize).toBe(4);
    expect(d.days).toBe(8); // ceil(225 / (4 * 8))
    expect(d.productiveHoursPerDay).toBe(PRODUCTIVE_HOURS_PER_DAY);
  });

  it("uses per-trade crew defaults", () => {
    expect(crewSizeForTrade("siding")).toBe(3);
    expect(crewSizeForTrade("exterior")).toBe(3);
    expect(crewSizeForTrade("landscaping")).toBe(3);
    expect(crewSizeForTrade("decks")).toBe(2);
    expect(crewSizeForTrade("zzz-unknown")).toBe(DEFAULT_CREW_SIZE);
    expect(crewSizeForTrade(null)).toBe(DEFAULT_CREW_SIZE);
  });

  it("honours an explicit crew size and productive hours", () => {
    expect(crewDuration({ crewHours: 80, crewSize: 2, productiveHoursPerDay: 10 }).days).toBe(4);
  });

  it("never reports a zero-day job when labor exists, and zero when it does not", () => {
    expect(crewDuration({ crewHours: 1, tradeKey: "roofing" }).days).toBe(1);
    expect(crewDuration({ crewHours: 0, tradeKey: "roofing" }).days).toBe(0);
    expect(crewDuration({ crewHours: null }).days).toBe(0);
  });
});
