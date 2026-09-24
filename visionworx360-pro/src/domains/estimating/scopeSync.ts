/**
 * Scope → estimate staleness (pure domain logic).
 *
 * An estimate is "based on an earlier scope" when the *structured* scope has
 * changed since the estimate was last synchronized. Narrative wording (project
 * description, customer notes, internal notes, assumptions prose) is
 * deliberately excluded from the fingerprint: rewriting a sentence must never
 * create estimate/revision noise.
 *
 * Framework free: no React, no network, no i18n.
 */

/** Only the structured fields that change *what is being estimated*. */
export interface ScopeFingerprintItem {
  id: string;
  sectionId?: string | null;
  roomId?: string | null;
  title?: string | null;
  actionKey?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  materialSelection?: string | null;
  finishSelection?: string | null;
  isIncluded?: boolean | null;
  archivedAt?: string | null;
  /** Authoritative trade recorded on the item; classifies labor downstream. */
  tradeKey?: string | null;
}

const norm = (v: unknown): string =>
  v == null ? "" : typeof v === "number" ? String(Math.round(v * 1e4) / 1e4) : String(v).trim();

/** Deterministic, stable across runtimes (djb2-xor, hex encoded). */
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fingerprint of the structured scope. Archived items are excluded entirely so
 * removing an item changes the fingerprint; ordering is normalized by id so a
 * pure re-order of the same data is not treated as a scope change.
 */
export function computeScopeFingerprint(items: readonly ScopeFingerprintItem[]): string {
  const rows = items
    .filter((i) => !i.archivedAt)
    .map((i) =>
      [
        i.id,
        norm(i.sectionId),
        norm(i.roomId),
        norm(i.title),
        norm(i.actionKey),
        norm(i.quantity),
        norm(i.unitKey),
        norm(i.materialSelection),
        norm(i.finishSelection),
        i.isIncluded === false ? "0" : "1",
      ].join("|"),
    )
    .sort();
  return `sf1:${rows.length}:${hash(rows.join("\n"))}`;
}

export type ScopeSyncAction = "none" | "update" | "revise";

export interface ScopeSyncState {
  /** Structured scope differs from what the estimate was synced against. */
  isStale: boolean;
  /** The single action the contractor should take. */
  action: ScopeSyncAction;
  currentFingerprint: string;
  syncedFingerprint: string | null;
}

/**
 * Editable (draft-family) estimates are updated in place; issued / locked /
 * customer-facing documents are never mutated — they get a new revision.
 */
export function assessScopeSync(input: {
  currentFingerprint: string;
  syncedFingerprint: string | null | undefined;
  isEditable: boolean;
  canRevise?: boolean;
}): ScopeSyncState {
  const synced = input.syncedFingerprint ?? null;
  // No baseline recorded yet: adopt silently instead of alarming the contractor.
  const isStale = synced != null && synced !== input.currentFingerprint;
  const action: ScopeSyncAction = !isStale
    ? "none"
    : input.isEditable
      ? "update"
      : input.canRevise === false
        ? "none"
        : "revise";
  return { isStale, action, currentFingerprint: input.currentFingerprint, syncedFingerprint: synced };
}

/**
 * Estimate lines whose scope item is gone or newly excluded. These are never
 * deleted automatically — the contractor reviews them, so contractor-entered
 * pricing can never be silently discarded.
 */
export function findOrphanedLineIds(
  lines: readonly { id: string; scopeItemId?: string | null }[],
  items: readonly ScopeFingerprintItem[],
): string[] {
  const live = new Set(
    items.filter((i) => !i.archivedAt && i.isIncluded !== false).map((i) => i.id),
  );
  return lines
    .filter((l) => l.scopeItemId != null && !live.has(l.scopeItemId))
    .map((l) => l.id);
}
