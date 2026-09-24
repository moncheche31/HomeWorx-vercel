/**
 * Module 009 future extension points — INTERFACES ONLY.
 *
 * Nothing here is implemented in Version 1. They exist so later AI, vision and
 * translation capabilities can replace or augment the deterministic parser
 * without changing any call site or the estimating engine.
 */

import type { VoiceDraftItem, VoiceMeasurement, VoiceParseOptions } from "./types";

/** Future: AI scope interpretation replacing/augmenting the rule-based parser. */
export interface ScopeInterpretationProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  interpret(transcript: string, options: VoiceParseOptions): Promise<VoiceDraftItem[]>;
}

/** Future: derive draft scope items from jobsite photos. */
export interface PhotoRecognitionProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  analyzePhoto(input: { storagePath: string; roomId: string | null }): Promise<VoiceDraftItem[]>;
}

/** Future: derive draft scope items from walkthrough video. */
export interface VideoRecognitionProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  analyzeVideo(input: { storagePath: string }): Promise<VoiceDraftItem[]>;
}

/** Future: automatic measurement capture (LiDAR, photogrammetry, laser tools). */
export interface AutomaticMeasurementProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  measure(input: { roomId: string }): Promise<VoiceMeasurement[]>;
}

/** Future: plan/drawing recognition producing rooms and quantities. */
export interface DrawingRecognitionProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  analyzeDrawing(input: { storagePath: string }): Promise<VoiceDraftItem[]>;
}

/** Future: code-compliance checks against detected scope. */
export interface CodeComplianceProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  review(input: { drafts: VoiceDraftItem[]; jurisdiction: string }): Promise<
    Array<{ draftId: string; codeReference: string; note: string }>
  >;
}

/** Future: real-time voice translation of captured speech. */
export interface VoiceTranslationProvider {
  readonly id: string;
  readonly isConfigured: boolean;
  translate(input: { text: string; from: string; to: string }): Promise<string>;
}
