/**
 * Module 009 — Voice-First Scope Capture contracts.
 *
 * Deterministic, rule-based parsing only. No AI interpretation and no external
 * AI services in Version 1. The estimating engine (Module 008) remains the
 * single source of truth for all math; this domain only produces *draft* scope
 * items that a human confirms.
 */

export type VoiceConfidence = "high" | "medium" | "low";

export type VoiceDraftStatus = "pending" | "approved" | "rejected";

export type VoiceDraftOrigin = "knowledge_base" | "custom";

/** A room the parser is allowed to associate items with. */
export interface VoiceRoomRef {
  id: string | null;
  name: string;
  /** Optional extra spoken aliases (e.g. "master bath"). */
  aliases?: string[];
}

/** Minimal Knowledge Base shape the matcher needs (keeps the domain UI-free). */
export interface VoiceAssemblyRef {
  assemblyKey: string;
  workItem: string;
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  unitKey: string | null;
  keywords?: string[];
}

export interface VoiceAssemblyMatch {
  assemblyKey: string;
  workItem: string;
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  unitKey: string | null;
  /** 0..1 normalized lexical score. Never presented as an AI probability. */
  score: number;
}

/** A spoken dimension captured verbatim — never interpreted or converted. */
export interface VoiceMeasurement {
  raw: string;
  kind: "length" | "area_dimensions" | "height" | "size";
  values: number[];
  unit: "foot" | "inch" | "unknown";
}

export interface VoiceDraftItem {
  id: string;
  /** The utterance this draft came from, verbatim. */
  sourceText: string;
  /** Position of the utterance in the transcript (stable ordering). */
  utteranceIndex: number;
  title: string;
  actionKey: string | null;
  quantity: number | null;
  unitKey: string | null;
  measurements: VoiceMeasurement[];
  roomId: string | null;
  roomName: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  origin: VoiceDraftOrigin;
  assemblyKey: string | null;
  /** Ranked alternates; length > 1 means the item is flagged for review. */
  matches: VoiceAssemblyMatch[];
  needsReview: boolean;
  confidence: VoiceConfidence;
  /** Human-readable, localizable reason keys for the confidence result. */
  reasonKeys: string[];
  status: VoiceDraftStatus;
  selected: boolean;
}

export interface VoiceParseOptions {
  rooms?: VoiceRoomRef[];
  assemblies?: VoiceAssemblyRef[];
  /** Injected for deterministic ids in tests. */
  idFactory?: (index: number) => string;
}

export interface VoiceParseResult {
  drafts: VoiceDraftItem[];
  /** Utterances that only set context (e.g. "in the kitchen"). */
  contextUtterances: string[];
}

export type VoiceCaptureState =
  | "idle"
  | "listening"
  | "paused"
  | "processing"
  | "review"
  | "unsupported"
  | "permission_denied"
  | "error";

/** Persisted between sessions so an interrupted walkthrough can be resumed. */
export interface VoiceCaptureSessionSnapshot {
  projectId: string;
  transcript: string;
  updatedAt: string;
}
