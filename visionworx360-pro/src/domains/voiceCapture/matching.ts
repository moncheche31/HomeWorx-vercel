import { STOP_WORDS } from "./lexicon";
import type { VoiceAssemblyMatch, VoiceAssemblyRef } from "./types";

/** Deterministic lexical matching against the Knowledge Base. No AI. */

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function assemblyTokens(a: VoiceAssemblyRef): string[] {
  return tokenize([a.workItem, ...(a.keywords ?? [])].join(" "));
}

/** Weighted token overlap normalized to 0..1. */
export function scoreAssembly(spokenTokens: string[], assembly: VoiceAssemblyRef): number {
  const target = assemblyTokens(assembly);
  if (spokenTokens.length === 0 || target.length === 0) return 0;
  const targetSet = new Set(target);
  let hits = 0;
  for (const token of new Set(spokenTokens)) {
    if (targetSet.has(token)) hits += 1;
    else if ([...targetSet].some((t) => t.startsWith(token) || token.startsWith(t))) hits += 0.5;
  }
  const coverage = hits / new Set(spokenTokens).size;
  const specificity = hits / targetSet.size;
  return Math.min(1, coverage * 0.7 + specificity * 0.3);
}

export function matchAssemblies(
  text: string,
  assemblies: VoiceAssemblyRef[],
  limit = 3,
): VoiceAssemblyMatch[] {
  const tokens = tokenize(text);
  return assemblies
    .map((a) => ({
      assemblyKey: a.assemblyKey,
      workItem: a.workItem,
      tradeKey: a.tradeKey,
      categoryKey: a.categoryKey,
      subcategoryKey: a.subcategoryKey,
      unitKey: a.unitKey,
      score: Number(scoreAssembly(tokens, a).toFixed(4)),
    }))
    .filter((m) => m.score >= 0.3)
    .sort((x, y) => y.score - x.score || x.workItem.localeCompare(y.workItem))
    .slice(0, limit);
}
