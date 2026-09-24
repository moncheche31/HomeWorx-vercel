import type { VoiceDraftItem } from "@/domains/voiceCapture";

/**
 * Duplicate prevention. Guided Mode and Advanced Edit write the same rows, so a
 * draft that has already been committed must never be inserted twice — not on
 * resume, not on re-review, not on a retried commit.
 */
export function draftDedupeKey(draft: VoiceDraftItem): string {
  const room = draft.roomId ?? "none";
  const title = draft.title.trim().toLowerCase().replace(/\s+/g, " ");
  return `${room}::${title}`;
}

export function filterUncommitted(
  drafts: VoiceDraftItem[],
  committedKeys: readonly string[],
): VoiceDraftItem[] {
  const seen = new Set(committedKeys);
  const out: VoiceDraftItem[] = [];
  for (const draft of drafts) {
    const key = draftDedupeKey(draft);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(draft);
  }
  return out;
}
