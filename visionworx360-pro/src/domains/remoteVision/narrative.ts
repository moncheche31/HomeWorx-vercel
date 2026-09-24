import { generateNarrative, type NarrativeDocument, type NarrativeSourceItem } from "@/domains/narrativeScope";
import { WORK_RULES, ruleScopeTitleFor } from "./lexicon";
import { collectFeatures } from "./analyze";
import type { Assumption, RemoteVisionLocale, VisionAnalysisResult } from "./types";

/**
 * Reuses the Module 010B narrative generator so the remote workflow produces
 * exactly the same plain-language Scope of Work as a walkthrough.
 */
export function buildRemoteNarrative(input: {
  projectName: string;
  locale: RemoteVisionLocale;
  audience?: "contractor" | "customer";
  result: VisionAnalysisResult;
  assumptions: Assumption[];
  answers?: Record<string, string>;
}): NarrativeDocument {
  const { projectName, locale, result, assumptions, answers, audience = "contractor" } = input;
  const features = collectFeatures(result);
  const roomName = result.rooms[0]?.label ?? null;
  const assumptionByTopic = new Map(assumptions.map((a) => [a.topic, a]));

  const items: NarrativeSourceItem[] = features.map((feature, index) => {
    const rule = WORK_RULES.find((r) => r.featureKey === feature.featureKey);
    const selection = rule?.assumptionTopics
      ?.map((topic) => assumptionByTopic.get(topic)?.selectedKey)
      .find((key) => key && key !== "unknown");
    /*
     * The written Scope of Work must read back the contractor's own wording.
     * "Pantry cabinet" showing up as "kitchen base cabinetry" is why a stated
     * item reads as missing from the estimate even though it was recognized.
     */
    const spoken = `${feature.evidence ?? ""} ${feature.label ?? ""}`;
    return {
      id: feature.id,
      title: rule ? ruleScopeTitleFor(rule, spoken, locale) : feature.label,
      actionKey: feature.actionKey ?? rule?.actionKey ?? null,

      quantity: feature.quantity,
      unitKey: feature.unitKey,
      materialSelection: selection ? selection.replace(/_/g, " ") : null,
      detail: feature.detail ?? null,

      customerNotes: null,
      roomId: null,
      sectionId: "remote-vision",
      isIncluded: true,
      isClientVisible: true,
      confidenceStatus: feature.confidence >= 0.6 ? "assumed" : "needs_verification",
      sortOrder: index,
    };
  });

  return generateNarrative({
    projectName,
    locale,
    audience,
    answers,
    items,
    sections: [
      {
        id: "remote-vision",
        name: roomName ?? projectName,
        roomId: null,
        sortOrder: 0,
      },
    ],
    rooms: [],
  });
}
