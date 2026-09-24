/**
 * Privacy-safe walkthrough analytics.
 *
 * Rules: counts and enum values only. Never transcript text, never scope item
 * titles, never client or property identifiers.
 */

export type WalkthroughEventName =
  | "walkthrough_started"
  | "room_started"
  | "recording_started"
  | "recording_paused"
  | "draft_reviewed"
  | "question_skipped"
  | "item_approved"
  | "walkthrough_completed"
  | "walkthrough_abandoned"
  | "advanced_edit_opened";

export interface WalkthroughEventPayload {
  step?: string;
  captureLanguage?: string;
  draftCount?: number;
  questionCount?: number;
  approvedCount?: number;
  roomCount?: number;
  questionKind?: string;
  resumed?: boolean;
}

type Listener = (name: WalkthroughEventName, payload: WalkthroughEventPayload) => void;

const listeners = new Set<Listener>();

/** Register a sink (analytics provider extension point). */
export function onWalkthroughEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const FORBIDDEN = ["transcript", "title", "text", "clientName", "address", "notes"];

export function trackWalkthroughEvent(
  name: WalkthroughEventName,
  payload: WalkthroughEventPayload = {},
): void {
  const safe: WalkthroughEventPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN.includes(key)) continue;
    if (typeof value === "string" && value.length > 32) continue;
    (safe as Record<string, unknown>)[key] = value;
  }
  for (const listener of listeners) listener(name, safe);
  if (import.meta.env.DEV) {
    console.debug("[walkthrough]", name, safe);
  }
}
