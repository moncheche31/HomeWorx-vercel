/**
 * Pure estimate-lineage helpers (Module 016, Phase 2).
 *
 * Framework-independent and side-effect free: no React, no network, no i18n.
 * Components/hooks consume these to derive lineages, read-only state,
 * change-order eligibility and label *tokens* — never hardcoded UI copy.
 */

export type LineageDocumentKind = "estimate" | "alternate" | "change_order";

export type LineageStatus =
  | "draft"
  | "in_review"
  | "ready"
  | "approved"
  | "sent"
  | "accepted"
  | "declined"
  | "superseded";

/** Minimal structural shape needed for lineage math. */
export interface LineageDocument {
  id: string;
  projectId: string;
  parentEstimateId?: string | null;
  documentKind?: LineageDocumentKind | null;
  lineageRootId?: string | null;
  revisionNumber?: number | null;
  version?: number | null;
  optionLabel?: string | null;
  supersededById?: string | null;
  status?: LineageStatus | string | null;
  lockedAt?: string | null;
  archivedAt?: string | null;
  createdAt?: string | null;
}

/** Statuses that terminate a document's editable life. */
export const READ_ONLY_STATUSES: readonly LineageStatus[] = [
  "accepted",
  "declined",
  "superseded",
  "approved",
];

/** Statuses treated as draft-family (legacy rows included). */
export const DRAFT_FAMILY_STATUSES: readonly LineageStatus[] = ["draft", "in_review", "ready"];

/* ---------------------------------------------------------------- getters */

export function documentKindOf(doc: LineageDocument): LineageDocumentKind {
  return doc.documentKind ?? "estimate";
}

export function statusOf(doc: LineageDocument): LineageStatus {
  const s = doc.status ?? "draft";
  return (READ_ONLY_STATUSES as readonly string[]).includes(s) ||
    (DRAFT_FAMILY_STATUSES as readonly string[]).includes(s) ||
    s === "sent"
    ? (s as LineageStatus)
    : "draft";
}

/** Legacy rows have no lineage_root_id: they are their own root. */
export function lineageRootIdOf(doc: LineageDocument): string {
  return doc.lineageRootId ?? doc.id;
}

/** Legacy rows fall back to `version - 1`, clamped at 0. */
export function revisionNumberOf(doc: LineageDocument): number {
  if (typeof doc.revisionNumber === "number" && Number.isFinite(doc.revisionNumber)) {
    return Math.max(0, Math.trunc(doc.revisionNumber));
  }
  const v = typeof doc.version === "number" && Number.isFinite(doc.version) ? doc.version : 1;
  return Math.max(0, Math.trunc(v) - 1);
}

/* ------------------------------------------------------------ predicates */

export function isChangeOrder(doc: LineageDocument): boolean {
  return documentKindOf(doc) === "change_order";
}

export function isAlternate(doc: LineageDocument): boolean {
  return documentKindOf(doc) === "alternate";
}

/** Root of its own lineage and revision 0, and not a change order. */
export function isOriginal(doc: LineageDocument): boolean {
  return (
    !isChangeOrder(doc) && lineageRootIdOf(doc) === doc.id && revisionNumberOf(doc) === 0
  );
}

export function isRevision(doc: LineageDocument): boolean {
  return !isChangeOrder(doc) && !isOriginal(doc);
}

export function isSuperseded(doc: LineageDocument): boolean {
  return statusOf(doc) === "superseded" || Boolean(doc.supersededById);
}

export function isAccepted(doc: LineageDocument): boolean {
  return statusOf(doc) === "accepted";
}

/** Locked timestamp OR a terminal status makes a document read-only. */
export function isReadOnly(doc: LineageDocument): boolean {
  if (doc.lockedAt) return true;
  if (doc.supersededById) return true;
  return (READ_ONLY_STATUSES as readonly string[]).includes(statusOf(doc));
}

export function isEditable(doc: LineageDocument): boolean {
  return !isReadOnly(doc);
}

/* ------------------------------------------------- change-order eligibility */

export type ChangeOrderBlockReason =
  | "not_accepted"
  | "source_is_change_order"
  | "archived";

export interface ChangeOrderEligibility {
  allowed: boolean;
  reason: ChangeOrderBlockReason | null;
}

/**
 * Change orders attach only to an accepted document. Alternates may be
 * accepted (they are peer proposals), so an accepted alternate qualifies;
 * a change order can never parent another change order.
 */
export function changeOrderEligibility(doc: LineageDocument): ChangeOrderEligibility {
  if (doc.archivedAt) return { allowed: false, reason: "archived" };
  if (isChangeOrder(doc)) return { allowed: false, reason: "source_is_change_order" };
  if (!isAccepted(doc)) return { allowed: false, reason: "not_accepted" };
  return { allowed: true, reason: null };
}

export function canCreateChangeOrder(doc: LineageDocument): boolean {
  return changeOrderEligibility(doc).allowed;
}

/* ------------------------------------------------------------- grouping */

export interface EstimateLineage<T extends LineageDocument = LineageDocument> {
  rootId: string;
  kind: LineageDocumentKind;
  optionLabel: string | null;
  /** Revisions ordered oldest → newest. */
  revisions: T[];
  /** Change orders attached to any document in this lineage. */
  changeOrders: T[];
  /** Latest non-superseded revision (or last revision as fallback). */
  active: T;
  accepted: T | null;
}

function compareDocs(a: LineageDocument, b: LineageDocument): number {
  const r = revisionNumberOf(a) - revisionNumberOf(b);
  if (r !== 0) return r;
  const ca = a.createdAt ?? "";
  const cb = b.createdAt ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Revisions of one lineage, oldest → newest. */
export function orderRevisions<T extends LineageDocument>(docs: readonly T[]): T[] {
  return [...docs].sort(compareDocs);
}

/**
 * Latest document a user should land on: the newest non-superseded revision.
 * Falls back to the newest revision when every one is superseded.
 */
export function selectActiveDocument<T extends LineageDocument>(
  docs: readonly T[],
): T | null {
  const ordered = orderRevisions(docs);
  if (ordered.length === 0) return null;
  const accepted = [...ordered].reverse().find((d) => isAccepted(d));
  if (accepted) return accepted;
  const live = [...ordered].reverse().find((d) => !isSuperseded(d));
  return live ?? ordered[ordered.length - 1]!;
}

/**
 * Group a project's documents into lineages. Alternates form their own peer
 * lineages; change orders are attached to the lineage of their parent.
 */
export function buildLineages<T extends LineageDocument>(
  docs: readonly T[],
): EstimateLineage<T>[] {
  const byId = new Map<string, T>();
  for (const d of docs) byId.set(d.id, d);

  const rootFor = (doc: T): string => {
    if (isChangeOrder(doc)) {
      const parentId = doc.parentEstimateId ?? doc.lineageRootId ?? null;
      const parent = parentId ? byId.get(parentId) : undefined;
      if (parent) return lineageRootIdOf(parent);
      return parentId ?? doc.id;
    }
    return lineageRootIdOf(doc);
  };

  const groups = new Map<string, { revisions: T[]; changeOrders: T[] }>();
  for (const doc of docs) {
    const root = rootFor(doc);
    let g = groups.get(root);
    if (!g) {
      g = { revisions: [], changeOrders: [] };
      groups.set(root, g);
    }
    if (isChangeOrder(doc)) g.changeOrders.push(doc);
    else g.revisions.push(doc);
  }

  const lineages: EstimateLineage<T>[] = [];
  for (const [rootId, g] of groups) {
    const revisions = orderRevisions(g.revisions);
    const changeOrders = orderRevisions(g.changeOrders);
    const active = selectActiveDocument(revisions) ?? changeOrders[0];
    if (!active) continue;
    const base = revisions[0] ?? active;
    lineages.push({
      rootId,
      kind: isAlternate(base) ? "alternate" : documentKindOf(base),
      optionLabel: base.optionLabel ?? null,
      revisions,
      changeOrders,
      active,
      accepted: revisions.find((d) => isAccepted(d)) ?? null,
    });
  }

  // Primary estimate lineages first, alternates after, stable by first doc.
  return lineages.sort((a, b) => {
    const rank = (l: EstimateLineage<T>) => (l.kind === "alternate" ? 1 : 0);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const da = a.revisions[0] ?? a.active;
    const db = b.revisions[0] ?? b.active;
    return compareDocs(da, db);
  });
}

/** Lineage a given document belongs to. */
export function findLineageFor<T extends LineageDocument>(
  lineages: readonly EstimateLineage<T>[],
  documentId: string,
): EstimateLineage<T> | null {
  return (
    lineages.find(
      (l) =>
        l.revisions.some((d) => d.id === documentId) ||
        l.changeOrders.some((d) => d.id === documentId),
    ) ?? null
  );
}

/* --------------------------------------------------------------- labels */

/**
 * i18n-ready label descriptor. Components map `kind` to translated copy and
 * interpolate the numeric/label parts — no English strings live here.
 */
export type DocumentLabel =
  | { kind: "estimate"; version: number; text: string }
  | { kind: "alternate"; version: number; option: string; text: string }
  | { kind: "change_order"; sequence: number; text: string };

/** Display version is 1-based: revision 0 → v1. */
export function displayVersion(doc: LineageDocument): number {
  return revisionNumberOf(doc) + 1;
}

/** "A", "B", ... "Z", "AA" — deterministic option letters by index. */
export function optionLetter(index: number): string {
  let i = Math.max(0, Math.trunc(index));
  let out = "";
  for (;;) {
    out = String.fromCharCode(65 + (i % 26)) + out;
    i = Math.floor(i / 26) - 1;
    if (i < 0) break;
  }
  return out;
}

/** "01", "02" ... zero-padded change-order sequence. */
export function changeOrderNumber(sequence: number): string {
  const n = Math.max(1, Math.trunc(sequence));
  return String(n).padStart(2, "0");
}

export function describeDocument(
  doc: LineageDocument,
  opts: { optionIndex?: number; changeOrderSequence?: number } = {},
): DocumentLabel {
  if (isChangeOrder(doc)) {
    const seq = opts.changeOrderSequence ?? revisionNumberOf(doc) + 1;
    return { kind: "change_order", sequence: seq, text: `CO-${changeOrderNumber(seq)}` };
  }
  const version = displayVersion(doc);
  if (isAlternate(doc)) {
    const stored = doc.optionLabel?.trim();
    const option = stored && stored.length > 0 ? stored : optionLetter(opts.optionIndex ?? 0);
    const text = /^option\b/i.test(option) ? option : `Option ${option}`;
    return { kind: "alternate", version, option, text };
  }
  return { kind: "estimate", version, text: `Estimate v${version}` };
}

/** Labels for every document in a project, keyed by document id. */
export function describeLineages<T extends LineageDocument>(
  lineages: readonly EstimateLineage<T>[],
): Map<string, DocumentLabel> {
  const out = new Map<string, DocumentLabel>();
  let optionIndex = 0;
  for (const lineage of lineages) {
    const isAlt = lineage.kind === "alternate";
    const idx = isAlt ? optionIndex++ : 0;
    for (const doc of lineage.revisions) {
      out.set(doc.id, describeDocument(doc, { optionIndex: idx }));
    }
    lineage.changeOrders.forEach((doc, i) => {
      out.set(doc.id, describeDocument(doc, { changeOrderSequence: i + 1 }));
    });
  }
  return out;
}
