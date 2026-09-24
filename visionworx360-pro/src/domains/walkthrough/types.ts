/**
 * Module 010 — Guided Walkthrough contracts.
 *
 * Pure, UI-free types shared by the guided (simple) mode. Guided Mode never
 * creates its own scope or estimating records: it produces the same voice
 * drafts as Module 009 and commits them through the existing scope services.
 */

import type { VoiceDraftItem } from "@/domains/voiceCapture";

export const WALKTHROUGH_STEPS = [
  "project",
  /**
   * Capture-first intake for the CURRENT project: video, photos, spoken or
   * typed description and quick measurements. A brand-new project always
   * starts here — never on a question list.
   */
  "intake",
  "room",
  "capture",
  "questions",
  "review",
  "summary",
] as const;

export type WalkthroughStep = (typeof WALKTHROUGH_STEPS)[number];

export interface WalkthroughContext {
  hasProject: boolean;
  /** Any current-project evidence captured yet (description/transcript/media). */
  hasEvidence: boolean;
  hasRoom: boolean;
  hasTranscript: boolean;
  questionCount: number;
  draftCount: number;
}

/** Capture language chosen by the contractor before recording. */
export type CaptureLanguage = "en-US" | "es-US";

export type WalkthroughQuestionKind =
  | "quantity"
  | "size"
  | "room"
  | "action"
  | "laborScope"
  | "allowance"
  | "match";

export interface WalkthroughQuestionOption {
  /** Stable value stored in the answer map. */
  value: string;
  /** i18n key OR raw label when `rawLabel` is true (Knowledge Base work items). */
  label: string;
  rawLabel?: boolean;
}

export interface WalkthroughQuestion {
  id: string;
  draftId: string;
  kind: WalkthroughQuestionKind;
  /** Short, jobsite-readable context (the draft title) — never the transcript. */
  subject: string;
  options: WalkthroughQuestionOption[];
  /** Free numeric/text answer allowed (quantity, size). */
  freeform: boolean;
}

export type WalkthroughAnswerValue = string | number;

export type WalkthroughAnswer =
  | { status: "answered"; value: WalkthroughAnswerValue }
  | { status: "skipped" }
  | { status: "unsure" }
  | { status: "later" };

export interface WalkthroughRoomProgress {
  roomId: string | null;
  roomName: string;
  approvedCount: number;
  completedAt: string;
}

/** Everything needed to resume an interrupted walkthrough. */
export interface WalkthroughSessionSnapshot {
  version: 2;
  projectId: string;
  projectName: string | null;
  roomId: string | null;
  roomName: string | null;
  step: WalkthroughStep;
  captureLanguage: CaptureLanguage;
  /** Project-level spoken/typed description captured during intake. */
  description: string;
  transcript: string;
  drafts: VoiceDraftItem[];
  answers: Record<string, WalkthroughAnswer>;
  /** Dedupe guard — keys of drafts already written to scope. */
  committedKeys: string[];
  completedRooms: WalkthroughRoomProgress[];
  updatedAt: string;
}
