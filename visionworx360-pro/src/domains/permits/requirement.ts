/**
 * PERMIT REQUIREMENT CLASSIFIER.
 *
 * Reads ONLY the current project's scope evidence plus its jurisdiction. It
 * never asserts that a permit IS required: without a verified local rule every
 * candidate is probabilistic and flagged `needsJurisdictionConfirmation`.
 *
 * Cosmetic-only work (paint, floor finish, cabinet hardware, minor trim) is
 * normally permit-not-likely.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type {
  PermitCandidate,
  PermitLikelihood,
  PermitRequirementInput,
  PermitRequirementResult,
  PermitScopeSignal,
  PermitType,
} from "./types";

const norm = (s: string) => ` ${String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const hasAny = (text: string, words: readonly string[]) =>
  words.some((w) => text.includes(` ${w} `) || text.includes(` ${w}s `));

/** Cosmetic work that normally needs no permit. */
const COSMETIC = [
  "paint",
  "painting",
  "prime",
  "repaint",
  "wallpaper",
  "caulk",
  "cabinet hardware",
  "knob",
  "pull",
  "baseboard",
  "shoe mold",
  "casing",
  "crown",
  "trim",
  "refinish",
  "floor finish",
  "sand",
  "carpet",
  "laminate",
  "vinyl plank",
  "lvp",
  "clean",
  "landscap",
  "mulch",
  "sod",
] as const;

interface TypeRule {
  permitType: PermitType;
  workClass: string;
  likely: readonly string[];
  possible?: readonly string[];
  /** Unit keys whose quantity counts as fixtures / devices / windows. */
  countUnits?: readonly string[];
}

const TYPE_RULES: TypeRule[] = [
  {
    permitType: "building",
    workClass: "structural_minor",
    likely: [
      "load bearing",
      "load-bearing",
      "structural",
      "lvl",
      "header",
      "beam",
      "post",
      "footing",
      "foundation",
      "shear wall",
      "framing",
      "frame wall",
      "frame walls",
      "stud wall",
      "roof structure",
      "joist",
      "rafter",
      "truss",
      "egress",
    ],
    possible: ["stair", "railing", "landing", "opening"],
  },
  {
    permitType: "electrical",
    workClass: "electrical_devices",
    likely: [
      "circuit",
      "panel",
      "subpanel",
      "service upgrade",
      "rewire",
      "rewiring",
      "wiring",
      "romex",
      "outlet",
      "receptacle",
      "gfci",
      "switch",
      "electrical rough",
      "light fixture rough",
    ],
    possible: ["lighting", "recessed light", "fan"],
    countUnits: ["each"],
  },
  {
    permitType: "plumbing",
    workClass: "plumbing_fixtures",
    likely: [
      "rough in",
      "rough-in",
      "dwv",
      "waste line",
      "vent stack",
      "water line",
      "supply line",
      "repipe",
      "gas line",
      "relocate fixture",
      "move drain",
      "shower valve",
      "toilet",
      "lavatory",
      "sink",
      "tub",
      "water heater",
      "shutoff",
    ],
    possible: ["faucet", "fixture"],
    countUnits: ["each"],
  },
  {
    permitType: "mechanical",
    workClass: "hvac_equipment",
    likely: [
      "hvac",
      "furnace",
      "condenser",
      "air handler",
      "mini split",
      "mini-split",
      "duct",
      "ductwork",
      "return air",
      "exhaust fan duct",
      "mechanical",
    ],
    possible: ["register", "vent"],
  },
  {
    permitType: "roofing",
    workClass: "roofing",
    likely: ["reroof", "re roof", "roof tear off", "shingle", "roof deck", "roofing", "underlayment"],
    possible: ["siding", "flashing"],
  },
  {
    permitType: "demolition",
    workClass: "demolition",
    likely: ["demolition", "demo wall", "remove wall", "tear out wall", "gut", "structural demo"],
    possible: ["demo", "remove", "tear out", "haul"],
  },
  {
    permitType: "building",
    workClass: "windows",
    likely: ["window", "exterior door", "patio door", "new opening", "enlarge opening"],
    countUnits: ["each"],
  },
  {
    permitType: "building",
    workClass: "deck",
    likely: ["deck", "porch", "pergola"],
  },
  {
    permitType: "zoning",
    workClass: "zoning",
    likely: ["change of use", "occupancy change", "adu", "accessory dwelling", "setback", "variance"],
  },
];

/** Project classes that imply a master building permit. */
const PROJECT_CLASS_RULES: { workClass: string; words: readonly string[] }[] = [
  { workClass: "conversion", words: ["garage conversion", "basement conversion", "convert garage", "convert basement", "change of use"] },
  { workClass: "addition", words: ["addition", "bump out", "bump-out", "new construction"] },
  { workClass: "whole_home_renovation", words: ["whole home", "whole house", "gut renovation", "full renovation"] },
  { workClass: "kitchen_remodel", words: ["kitchen remodel", "kitchen renovation", "remodel kitchen"] },
  { workClass: "bathroom_remodel", words: ["bathroom remodel", "bath remodel", "bathroom renovation", "master bath"] },
  { workClass: "basement_finish", words: ["basement finish", "finish basement", "finished basement"] },
];

const combinedText = (signals: PermitScopeSignal[], projectClass?: string | null) =>
  norm([projectClass ?? "", ...signals.map((s) => `${s.description ?? ""} ${s.tradeKey ?? ""}`)].join(" "));

/** Infer the project-level work class used to pick a master building rule. */
export function inferProjectWorkClass(input: PermitRequirementInput): string | null {
  const text = combinedText(input.signals, input.projectClass);
  for (const rule of PROJECT_CLASS_RULES) {
    if (rule.words.some((w) => text.includes(norm(w).trim()))) return rule.workClass;
  }
  return null;
}

const countUnits = (signals: PermitScopeSignal[], rule: TypeRule, matched: string[]): number | null => {
  if (!rule.countUnits) return null;
  let total = 0;
  for (const s of signals) {
    const text = norm(`${s.description ?? ""}`);
    if (!matched.some((m) => text.includes(m))) continue;
    if (!rule.countUnits.includes(String(s.unitKey ?? ""))) continue;
    const q = Number(s.quantity ?? 0);
    if (Number.isFinite(q) && q > 0) total += q;
  }
  return total > 0 ? Math.round(total) : null;
};

/**
 * Classify which permits this project's scope plausibly requires.
 * Verified local rules can upgrade a candidate later; this stage stays
 * probabilistic on purpose.
 */
export function classifyPermitRequirements(
  input: PermitRequirementInput,
): PermitRequirementResult {
  const signals = (input.signals ?? []).filter((s) => String(s.description ?? "").trim().length > 0);
  const text = combinedText(signals, input.projectClass);
  const projectClass = inferProjectWorkClass(input);

  const cosmeticOnly =
    signals.length > 0 &&
    !projectClass &&
    signals.every((s) => {
      const t = norm(s.description);
      return hasAny(t, COSMETIC);
    });

  const candidates: PermitCandidate[] = [];
  const push = (c: PermitCandidate) => {
    const existing = candidates.find(
      (x) => x.permitType === c.permitType && x.workClass === c.workClass,
    );
    if (!existing) {
      candidates.push(c);
      return;
    }
    if (existing.likelihood !== "likely" && c.likelihood === "likely") existing.likelihood = "likely";
    existing.drivers = [...new Set([...existing.drivers, ...c.drivers])];
    if (c.countedUnits) existing.countedUnits = (existing.countedUnits ?? 0) + c.countedUnits;
  };

  if (!cosmeticOnly) {
    for (const rule of TYPE_RULES) {
      const likelyHits = rule.likely.filter((w) => text.includes(norm(w).trim()));
      const possibleHits = (rule.possible ?? []).filter((w) => text.includes(norm(w).trim()));
      if (likelyHits.length === 0 && possibleHits.length === 0) continue;
      const likelihood: PermitLikelihood = likelyHits.length > 0 ? "likely" : "possible";
      const drivers = [...likelyHits, ...possibleHits].slice(0, 6);
      push({
        permitType: rule.permitType,
        workClass: rule.workClass,
        likelihood,
        drivers,
        countedUnits: countUnits(signals, rule, drivers.map((d) => norm(d).trim())),
      });
    }

    /* A master project class always yields a building permit candidate. */
    if (projectClass) {
      const structural = candidates.filter(
        (c) => c.permitType === "building" && c.workClass === "structural_minor",
      );
      for (const s of structural) candidates.splice(candidates.indexOf(s), 1);
      candidates.unshift({
        permitType: "building",
        workClass: projectClass,
        likelihood: "likely",
        drivers: [projectClass.replace(/_/g, " ")],
        countedUnits: null,
      });
    }
  }

  /*
   * ONE building permit per project. A jurisdiction issues a single general /
   * building permit, so window, deck and structural candidates collapse into
   * the most specific class rather than stacking multiple general fees.
   */
  const buildingRank = (workClass: string) =>
    PROJECT_CLASS_RULES.some((r) => r.workClass === workClass) ? 0 : workClass === "structural_minor" ? 1 : 2;
  const buildings = candidates.filter((c) => c.permitType === "building");
  if (buildings.length > 1) {
    const keep = [...buildings].sort((a, b) => buildingRank(a.workClass) - buildingRank(b.workClass))[0];
    keep.drivers = [...new Set(buildings.flatMap((b) => b.drivers))].slice(0, 8);
    keep.countedUnits =
      buildings.reduce((sum, b) => sum + (b.countedUnits ?? 0), 0) || (keep.countedUnits ?? null);
    if (buildings.some((b) => b.likelihood === "likely")) keep.likelihood = "likely";
    for (const b of buildings) {
      if (b === keep) continue;
      candidates.splice(candidates.indexOf(b), 1);
    }
  }

  return {
    candidates,
    none: candidates.length === 0,
    needsJurisdictionConfirmation: candidates.length > 0,
  };
}
