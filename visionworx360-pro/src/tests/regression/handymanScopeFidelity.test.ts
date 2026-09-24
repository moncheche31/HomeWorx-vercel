/**
 * MANDATORY ACCEPTANCE CASE — live "Handyman" project transcript.
 *
 * Three independent small tasks were expanded into a five-figure whole-house
 * remodel: 2,800 SF siding replacement, plumbing rough-in, ~735 SF of painting
 * and 1,800 SF of insulation. None of it was ever stated. These tests lock the
 * scope admission contract in place so no small job can be inflated again.
 */

import { describe, expect, it } from "vitest";

import { analyzeDescription, collectFeatures } from "@/domains/remoteVision/analyze";
import { admitScope } from "@/domains/scopeAdmission";
import { extractZones } from "@/domains/workRecognition/geometry";

const HANDYMAN_TRANSCRIPT = [
  "On the front of the house I need to remove about 56 linear feet of 1x6 fascia",
  "and replace it with a 1x2 shadow board, painted to match.",
  "In the basement I am going to install 2 inch rigid foam on the ceiling.",
  "That basement ceiling is 10 feet by 21 feet, taped and foamed with screws and washers.",
  "Then build a 19 inch by 42 inch access door for the plumbing chase out of 1x4 lumber",
  "and quarter inch plywood, hinged and painted white.",
].join(" ");

function analyze(text: string) {
  return analyzeDescription({
    description: text,
    locale: "en-US",
    media: [],
  });
}


function featureKeys(text: string): string[] {
  return collectFeatures(analyze(text)).map((f) => f.featureKey);
}

describe("Handyman scope fidelity (mandatory regression)", () => {
  const result = analyze(HANDYMAN_TRANSCRIPT);
  const keys = collectFeatures(result).map((f) => f.featureKey);
  const priced = [
    ...(result.grounded?.explicit ?? []),
    ...(result.grounded?.incidental ?? []),
  ];

  it("admits the fascia / shadow board replacement", () => {
    expect(keys).toContain("fascia.replace");
  });

  it("never produces whole-house siding replacement", () => {
    expect(keys).not.toContain("siding.replace");
    const siding = priced.find((i) => i.featureKey === "siding.replace");
    expect(siding).toBeUndefined();
  });

  it("never produces plumbing scope from 'plumbing chase'", () => {
    expect(keys.filter((k) => k.startsWith("plumbing"))).toHaveLength(0);
    expect(priced.some((i) => i.featureKey.startsWith("plumbing"))).toBe(false);
  });

  it("never produces 1,800 SF of insulation", () => {
    const insulation = priced.filter((i) => i.featureKey.includes("insulation"));
    for (const line of insulation) {
      expect(line.quantity ?? 0).toBeLessThanOrEqual(300);
    }
  });

  it("treats no component dimension as room geometry", () => {
    const zones = extractZones(HANDYMAN_TRANSCRIPT);
    for (const zone of zones) {
      expect(zone.widthFt).toBeGreaterThanOrEqual(3);
      expect(zone.lengthFt).toBeGreaterThanOrEqual(3);
    }
    // 1x6, 1x2, 1x4 and 19x42 inches must not create work areas.
    expect(zones.some((z) => (z.areaSf ?? 0) < 30)).toBe(false);
  });

  it("keeps the basement ceiling at its stated 210 SF", () => {
    const zones = extractZones(HANDYMAN_TRANSCRIPT);
    const basement = zones.find((z) => z.areaSf === 210);
    expect(basement).toBeDefined();
  });

  it("prices no line from a fabricated catalog default", () => {
    for (const line of priced) {
      if (line.provenance?.isDefault) {
        expect(line.quantity).toBeNull();
      }
    }
  });
});

describe("scope admission contract", () => {
  it("does not create scope from objects merely visible in media", () => {
    const admission = admitScope({
      text: "Replace the fascia on the front of the house.",
      candidates: [
        { featureKey: "fascia.replace", label: "Fascia", sentence: "Replace the fascia on the front of the house", source: "description" },
        { featureKey: "roof.replace", label: "Roof", sentence: "asphalt shingle roof", source: "vision" },
        { featureKey: "siding.replace", label: "Siding", sentence: "vinyl siding visible", source: "vision" },
        { featureKey: "windows.replace", label: "Windows", sentence: "double hung windows", source: "vision" },
      ],
    });
    expect(admission.admitted.map((a) => a.featureKey)).toEqual(["fascia.replace"]);
    expect(admission.suggested.every((s) => s.code === "media_only")).toBe(true);
  });

  it("routes 'plumbing chase access door' to carpentry, not plumbing", () => {
    const keys = featureKeys("Build an access door for the plumbing chase out of 1x4 lumber.");
    expect(keys.some((k) => k.startsWith("plumbing"))).toBe(false);
  });

  it("does not create flooring scope from 'protect the hardwood floor'", () => {
    const keys = featureKeys("Protect the hardwood floor while painting the trim.");
    expect(keys.some((k) => k.startsWith("flooring"))).toBe(false);
  });

  it("suppresses negated scope", () => {
    const admission = admitScope({
      text: "Do not replace the siding. Just replace the fascia.",
      candidates: [
        { featureKey: "siding.replace", label: "Siding", sentence: "Do not replace the siding", source: "description" },
        { featureKey: "fascia.replace", label: "Fascia", sentence: "Just replace the fascia", source: "description" },
      ],
    });
    expect(admission.admitted.map((a) => a.featureKey)).toEqual(["fascia.replace"]);
    expect(admission.suggested.some((s) => s.code === "negated")).toBe(true);
  });

  it("lets a referenced rendering detail only the stated bookcases", () => {
    const admission = admitScope({
      text: "Build the built-in bookcases like this rendering.",
      candidates: [
        { featureKey: "trim.builtin_casework", label: "Built-in bookcases", sentence: "Build the built-in bookcases like this rendering", source: "description" },
        { featureKey: "flooring.hardwood", label: "Hardwood flooring", sentence: "hardwood floor visible in rendering", source: "vision" },
        { featureKey: "lighting.recessed", label: "Recessed lighting", sentence: "recessed cans visible in rendering", source: "vision" },
      ],
    });
    expect(admission.admitted.some((a) => a.featureKey === "trim.builtin_casework")).toBe(true);
    expect(admission.admitted.some((a) => a.featureKey === "flooring.hardwood")).toBe(false);
    expect(admission.admitted.some((a) => a.featureKey === "lighting.recessed")).toBe(false);
    expect(admission.mediaReferenced).toBe(true);
  });

  it("may suggest LVL support dependencies but no unrelated trades", () => {
    const admission = admitScope({
      text: "Install a 26 foot LVL beam where we take out the bearing wall.",
      candidates: [
        { featureKey: "structural.lvl_beam", label: "LVL beam", sentence: "Install a 26 foot LVL beam", source: "description" },
      ],
    });
    expect(admission.admitted.some((a) => a.featureKey === "structural.lvl_beam")).toBe(true);
    const dependencyCodes = admission.suggested.filter((s) => s.code.startsWith("dependency"));
    for (const dependency of dependencyCodes) {
      expect(dependency.requiredBy).toBeTruthy();
      expect(dependency.reason).toBeTruthy();
    }
    expect(admission.admitted.some((a) => a.featureKey?.startsWith("plumbing"))).toBe(false);
    expect(admission.admitted.some((a) => a.featureKey?.startsWith("electrical"))).toBe(false);
  });
});
