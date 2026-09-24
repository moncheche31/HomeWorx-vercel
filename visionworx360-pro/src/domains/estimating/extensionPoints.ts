/**
 * Future extension points (Module 008) — INTERFACES ONLY.
 *
 * Nothing here is implemented in Version 1. They exist so future modules plug
 * into the estimating engine without re-architecting it. Do NOT add runtime
 * behaviour to this file.
 */

import type { EngineLineInput, EstimateEngineResult } from "./engine/types";

/** Anything that produces estimable work: manual, voice, AI, photo, video. */
export interface ScopeInputSource {
  readonly id: string;
  readonly kind: "manual" | "voice" | "ai" | "photo" | "video" | "import";
  toEngineLines(payload: unknown): Promise<EngineLineInput[]>;
}

export interface VoiceEstimatingProvider extends ScopeInputSource {
  readonly kind: "voice";
}

export interface PhotoRecognitionProvider extends ScopeInputSource {
  readonly kind: "photo";
}

export interface VideoRecognitionProvider extends ScopeInputSource {
  readonly kind: "video";
}

export interface AiRecommendationProvider {
  readonly id: string;
  suggest(input: {
    organizationId: string;
    lines: EngineLineInput[];
  }): Promise<{ lineId: string; field: string; value: number; rationale?: string }[]>;
}

export interface ProposalGenerator {
  readonly id: string;
  generate(input: { estimateId: string; result: EstimateEngineResult }): Promise<{ documentId: string }>;
}

export interface PurchasingProvider {
  readonly id: string;
  createPurchaseOrder(input: { estimateId: string; lineIds: string[] }): Promise<{ orderId: string }>;
}

export interface SchedulingProvider {
  readonly id: string;
  scheduleFromEstimate(input: { estimateId: string; crewHoursByTrade: Record<string, number> }): Promise<void>;
}

export interface InsuranceEstimatingProvider {
  readonly id: string;
  mapToCarrierFormat(result: EstimateEngineResult): Promise<unknown>;
}

/** HomeWorx360 (homeowner-facing) consumption of a contractor estimate. */
export interface HomeWorxBridge {
  readonly id: string;
  publishEstimate(input: { estimateId: string; result: EstimateEngineResult }): Promise<void>;
}
