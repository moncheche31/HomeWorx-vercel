import { WORK_RULES } from "./lexicon";
import { collectFeatures } from "./analyze";
import type { Assumption, RemoteVisionQuestion, VisionAnalysisResult } from "./types";
import type { GroundedScopeItem, QuantityProvenance } from "@/domains/scopeGrounding/types";
import type { DetectedFeatureBase } from "./types";

interface QuestionSpec {
  topic: string;
  /** Only ask when one of these features was detected. */
  featureKeys: string[];
  /** Skip when the assumption is already contractor-confirmed. */
  assumptionTopic?: Assumption["topic"];
  suggestions: string[];
  /** Ask only while the detected work still lacks a positive count. */
  missingCountOnly?: boolean;
}

const SPECS: QuestionSpec[] = [
  {
    topic: "window_count",
    featureKeys: ["windows.replace"],
    suggestions: ["1", "4", "8"],
    missingCountOnly: true,
  },
  {
    topic: "cabinet_manufacturer",
    featureKeys: ["cabinets.replace", "cabinets.island"],
    suggestions: ["Stock", "Semi-custom", "Custom"],
  },
  {
    topic: "countertop_material",
    featureKeys: ["countertops.replace"],
    assumptionTopic: "countertop_material",
    suggestions: ["Quartz", "Granite", "Laminate"],
  },
  {
    topic: "flooring_type",
    featureKeys: ["flooring.replace"],
    assumptionTopic: "flooring_type",
    suggestions: ["LVP", "Tile", "Hardwood"],
  },
  {
    topic: "electrical_panel",
    featureKeys: ["lighting.recessed", "mechanical.electrical"],
    suggestions: ["100A", "200A", "Unknown"],
  },
  {
    topic: "plumbing_location",
    featureKeys: ["mechanical.plumbing", "fixtures.replace"],
    suggestions: ["Staying", "Relocating"],
  },
  {
    topic: "paint_grade",
    featureKeys: ["paint.interior"],
    assumptionTopic: "paint_grade",
    suggestions: ["Builder grade", "Mid grade", "Premium"],
  },
  {
    topic: "structural_engineering",
    featureKeys: ["structural.wall_removal", "structural.lvl_beam"],
    suggestions: ["Engineer engaged", "Not yet", "Not required"],
  },
];

/**
 * Only genuinely missing information is asked about — never a form of every
 * field, and never a question the contractor already answered by choosing an
 * assumption manually.
 */
export function buildQuestions(
  result: VisionAnalysisResult,
  assumptions: Assumption[],
  answers: Record<string, string> = {},
): RemoteVisionQuestion[] {
  const detected = new Set(collectFeatures(result).map((f) => f.featureKey));
  const features = collectFeatures(result);
  const confirmed = new Set(
    assumptions.filter((a) => !a.isAutomatic && a.selectedKey !== "unknown").map((a) => a.topic),
  );

  return SPECS.filter((spec) => {
    if (!spec.featureKeys.some((key) => detected.has(key))) return false;
    if (
      spec.missingCountOnly &&
      !features.some(
        (feature) =>
          spec.featureKeys.includes(feature.featureKey) &&
          !(Number(feature.pricingQuantity ?? feature.quantity ?? 0) > 0),
      )
    ) return false;
    if (spec.assumptionTopic && confirmed.has(spec.assumptionTopic)) return false;
    const id = `question:${spec.topic}`;
    return !answers[id]?.trim();
  }).map((spec) => ({
    id: `question:${spec.topic}`,
    topic: spec.topic,
    promptKey: `questions.prompt.${spec.topic}`,
    suggestions: spec.suggestions,
  }));
}

/** Apply a contractor-provided window count before pricing and commit. */
export function applyQuantityAnswers(
  result: VisionAnalysisResult,
  answers: Record<string, string>,
): VisionAnalysisResult {
  const count = Number(answers["question:window_count"]?.trim() ?? "");
  if (!Number.isInteger(count) || count <= 0 || count > 500) return result;

  const provenance = (current?: QuantityProvenance): QuantityProvenance => ({
    evidence: current?.evidence ?? null,
    rationale: `Contractor confirmed a count of ${count} windows.`,
    source: "contractor_override",
    isDefault: false,
  });
  const applyFeature = (item: DetectedFeatureBase): DetectedFeatureBase =>
    item.featureKey === "windows.replace"
    ? {
        ...item,
        quantity: count,
        pricingQuantity: count,
        provenance: provenance(item.provenance),
      }
    : item;
  const applyGrounded = (item: GroundedScopeItem): GroundedScopeItem =>
    item.featureKey === "windows.replace"
      ? {
          ...item,
          quantity: count,
          pricingQuantity: count,
          provenance: provenance(item.provenance),
        }
      : item;

  return {
    ...result,
    windows: result.windows.map(applyFeature),
    grounded: result.grounded
      ? {
          ...result.grounded,
          explicit: result.grounded.explicit.map(applyGrounded),
          incidental: result.grounded.incidental.map(applyGrounded),
        }
      : result.grounded,
  };
}

/** Feature keys that exist in the lexicon (guards spec typos in tests). */
export const KNOWN_FEATURE_KEYS = WORK_RULES.map((r) => r.featureKey);
