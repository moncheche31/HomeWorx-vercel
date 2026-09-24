import { WORK_RULES } from "./lexicon";
import { collectFeatures } from "./analyze";
import type { Assumption, AssumptionTopic, VisionAnalysisResult } from "./types";

interface TopicSpec {
  topic: AssumptionTopic;
  optionKeys: string[];
  /** Phrases that pin the assumption to a specific option. */
  hints: Array<{ match: RegExp; optionKey: string }>;
  defaultKey: string;
}

export const TOPIC_SPECS: TopicSpec[] = [
  {
    topic: "cabinet_grade",
    optionKeys: ["builder_grade", "mid_grade", "premium", "unknown"],
    defaultKey: "mid_grade",
    hints: [
      { match: /\bstock\b|\bbuilder\b|\beconóm/i, optionKey: "builder_grade" },
      { match: /\bshaker\b|\bsemi-?custom\b|\bpainted\b|\bpintado/i, optionKey: "mid_grade" },
      { match: /\bcustom\b|\binset\b|\bpremium\b|\bpersonalizad/i, optionKey: "premium" },
    ],
  },
  {
    topic: "flooring_type",
    optionKeys: ["lvp", "hardwood", "tile", "unknown"],
    defaultKey: "unknown",
    hints: [
      { match: /\blvp\b|\bvinyl\b|\bvinil/i, optionKey: "lvp" },
      { match: /\bhardwood\b|\bmadera\b|\boak\b/i, optionKey: "hardwood" },
      { match: /\btile\b|\bporcelain\b|\bazulejo\b|\bporcelanato\b/i, optionKey: "tile" },
    ],
  },
  {
    topic: "countertop_material",
    optionKeys: ["laminate", "quartz", "granite", "unknown"],
    defaultKey: "unknown",
    hints: [
      { match: /\bquartz\b|\bcuarzo\b/i, optionKey: "quartz" },
      { match: /\bgranite\b|\bgranito\b/i, optionKey: "granite" },
      { match: /\blaminate\b|\blaminado\b/i, optionKey: "laminate" },
    ],
  },
  {
    topic: "paint_grade",
    optionKeys: ["builder_grade", "mid_grade", "premium", "unknown"],
    defaultKey: "mid_grade",
    hints: [
      { match: /\blow-?voc\b|\bpremium paint\b|\bpintura premium\b/i, optionKey: "premium" },
      { match: /\bbuilder\b|\bcontractor grade\b/i, optionKey: "builder_grade" },
    ],
  },
  {
    topic: "lighting_package",
    optionKeys: ["builder_grade", "mid_grade", "premium", "unknown"],
    defaultKey: "mid_grade",
    hints: [{ match: /\bdesigner\b|\bpendant\b|\bcolgante\b/i, optionKey: "premium" }],
  },
  {
    topic: "appliance_grade",
    optionKeys: ["builder_grade", "mid_grade", "premium", "unknown"],
    defaultKey: "unknown",
    hints: [
      { match: /\bpro(fessional)?\b|\bsub-?zero\b|\bwolf\b|\bthermador\b/i, optionKey: "premium" },
      { match: /\bstainless\b|\bacero inoxidable\b/i, optionKey: "mid_grade" },
    ],
  },
  {
    topic: "structural_engineering",
    optionKeys: ["required", "not_required", "unknown"],
    defaultKey: "required",
    hints: [{ match: /\bnon-?load bearing\b|\bno estructural\b/i, optionKey: "not_required" }],
  },
];

/**
 * Every missing decision gets a reasonable, visible assumption. Nothing is
 * hidden from the contractor and everything can be overridden.
 */
export function buildAssumptions(
  result: VisionAnalysisResult,
  description: string,
  overrides: Record<string, string> = {},
): Assumption[] {
  const features = collectFeatures(result);
  const relevant = new Set<AssumptionTopic>();
  for (const feature of features) {
    const rule = WORK_RULES.find((r) => r.featureKey === feature.featureKey);
    for (const topic of rule?.assumptionTopics ?? []) relevant.add(topic);
  }

  return TOPIC_SPECS.filter((spec) => relevant.has(spec.topic)).map((spec) => {
    const hit = spec.hints.find((h) => h.match.test(description));
    const automaticKey = hit?.optionKey ?? spec.defaultKey;
    const id = `assumption:${spec.topic}`;
    const override = overrides[id];
    return {
      id,
      topic: spec.topic,
      optionKeys: spec.optionKeys,
      selectedKey: override ?? automaticKey,
      isAutomatic: !override,
      confidence: override ? 1 : hit ? 0.75 : 0.45,
      basis: hit ? (description.match(hit.match)?.[0] ?? null) : null,
    } satisfies Assumption;
  });
}

/** Cost weight a chosen option applies to the drivers it influences. */
export const OPTION_WEIGHTS: Record<string, number> = {
  builder_grade: 0.8,
  mid_grade: 1,
  premium: 1.35,
  lvp: 0.9,
  tile: 1.15,
  hardwood: 1.3,
  laminate: 0.7,
  quartz: 1.1,
  granite: 1.05,
  required: 1.1,
  not_required: 0.95,
  unknown: 1,
};
