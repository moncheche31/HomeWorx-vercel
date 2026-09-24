import { describe, expect, it } from "vitest";
import { attachBookMatches } from "@/features/estimating/services/assemblyExpansion.core";

const CORRECTION = {
  id: "corr-1",
  wrong_term: "baseboard and casing trim",
  corrected_term: "vinyl deck trim",
  trigger_phrase: null,
  context_scope: "any",
  trade_key: null,
  capture_method: "explicit_correction",
  is_active: true,
};

function makeSb(corrections: Record<string, unknown>[]) {
  const probes: string[] = [];
  const bumped: string[][] = [];
  const sb = {
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: table === "contractor_terminology_corrections" ? corrections : [],
            error: null,
          }),
      }),
    }),
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      if (fn === "nce_book_lookup") {
        probes.push(String(args?._description ?? ""));
        return {
          data: [
            {
              reference_id: 1,
              description: "Vinyl deck trim board",
              unit: "LF",
              section: "Decking",
              score: 0.9,
              is_ambiguous: false,
              material: 2,
              labor: 1,
              craft_hours: null,
            },
          ],
          error: null,
        };
      }
      if (fn === "current_active_organization_id") return { data: "org-1", error: null };
      if (fn === "bump_terminology_correction_usage") {
        bumped.push((args?._ids as string[]) ?? []);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { sb: sb as never, probes, bumped };
}

const dto = () =>
  ({
    id: "exp-1",
    components: [
      {
        id: "c1",
        sequence: 1,
        name: "baseboard and casing trim",
        searchTerms: ["baseboard and casing trim"],
        selectedReferenceId: null,
        quantityBasis: "linear_foot_run",
        bookCandidates: [],
        bookMatch: null,
      },
    ],
  }) as never;

describe("terminology memory wired into book matching", () => {
  it("searches the book with the contractor's corrected wording and records the use", async () => {
    const { sb, probes, bumped } = makeSb([CORRECTION]);
    await attachBookMatches(sb, "carpentry", dto());
    expect(probes.some((p) => p.includes("vinyl deck trim"))).toBe(true);
    expect(probes.some((p) => p.includes("baseboard"))).toBe(false);
    expect(bumped.flat()).toContain("corr-1");
  });

  it("leaves matching completely unchanged when no correction applies", async () => {
    const { sb, probes, bumped } = makeSb([]);
    await attachBookMatches(sb, "carpentry", dto());
    expect(probes.some((p) => p.includes("baseboard and casing trim"))).toBe(true);
    expect(bumped).toHaveLength(0);
  });
});
