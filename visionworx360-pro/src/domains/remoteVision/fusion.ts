/**
 * MULTIMODAL FUSION / EVIDENCE AUTHORITY (Item B).
 *
 * One step that combines contractor speech/text, confirmed measurements,
 * before photos, after renderings, floor plans and video keyframes into a
 * single current-project understanding, with provenance on every fact.
 *
 * AUTHORITY ORDER — highest first. A lower-authority visual inference may NEVER
 * overwrite explicit contractor scope; it can only add a reviewable candidate.
 *
 *   1 contractor_override      explicit manual correction
 *   2 confirmed_measurement    contractor-confirmed measurement / answer
 *   3 contractor_statement     spoken/written action + object
 *   4 drawing_dimension        legible dimension tied to the subject
 *   5 visual_observation       photo/keyframe observation, rendering intent
 *   6 catalog_assumption       allowance / catalog default
 *
 * Pure module: no React, no IO, no network.
 */

import type { ConfirmedRunMeasurement } from "@/domains/scopeGrounding";
import { collectFeatures } from "./analyze";
import {
  evaluateWorkCandidate,
  matchSubject,
  ontologySubject,
  subjectForFeatureKey,
  type OntologySubject,
} from "./ontology";
import type {
  HiddenConditionWarning,
  MeasurementTarget,
  VisualUnderstandingResult,
} from "./visualUnderstanding";
import type { VisionAnalysisResult } from "./types";

export const AUTHORITY_ORDER = [
  "contractor_override",
  "confirmed_measurement",
  "contractor_statement",
  "drawing_dimension",
  "visual_observation",
  "catalog_assumption",
] as const;

export type FactAuthority = (typeof AUTHORITY_ORDER)[number];

export function authorityRank(authority: FactAuthority): number {
  const index = AUTHORITY_ORDER.indexOf(authority);
  return index < 0 ? AUTHORITY_ORDER.length : index;
}

/** Does `a` outrank `b`? */
export function outranks(a: FactAuthority, b: FactAuthority): boolean {
  return authorityRank(a) < authorityRank(b);
}

export type FactStatus = "confirmed" | "inferred" | "assumed" | "design_intent";

/**
 * Photo corroboration may sharpen a contractor statement's confidence, but a
 * photo can never make a fact certain — only the contractor can.
 */
export const CORROBORATION_CONFIDENCE_CAP = 0.95;

export interface FactProvenance {
  authority: FactAuthority;
  status: FactStatus;
  /** transcript | measurement | before_photo | after_rendering | floor_plan | video_keyframe | catalog */
  sourceType: string;
  /** Media id / measurement id when applicable. */
  sourceId: string | null;
  /** Verbatim snippet, drawing reference, or short model note. */
  evidence: string | null;
  confidence: number;
  /**
   * A lower-authority source that independently agrees with this fact. Photos
   * that corroborate contractor scope STRENGTHEN it; they never create it and
   * never change its authority.
   */
  corroboratedBy?: FactAuthority | null;
  /** Media ids backing the corroboration, for the audit trail. */
  corroboratingMediaIds?: string[];
}

/** Lifecycle of a visual-only work candidate. Promotion is contractor-only. */
export type VisualCandidateStatus = "awaiting_confirmation" | "context_only";

export interface ProjectFact {
  id: string;
  /** Ontology subject the fact is about, when it maps to one. */
  subjectKey: string | null;
  /** Intake feature key when this fact is priceable scope. */
  featureKey: string | null;
  label: string;
  /** install | remove | replace | ... — null for condition-only facts. */
  actionKey: string | null;
  quantity: number | null;
  unitKey: string | null;
  /** True when the fact is priceable scope rather than an observation. */
  isScope: boolean;
  /** Set only on visual-observation facts. */
  candidateStatus?: VisualCandidateStatus;
  provenance: FactProvenance;
}


export interface ProjectUnderstanding {
  facts: ProjectFact[];
  hiddenConditionWarnings: HiddenConditionWarning[];
  measurementTargets: MeasurementTarget[];
  /** Whether real pixel analysis contributed, and why not when it did not. */
  visualStatus: VisualUnderstandingResult["status"];
  visualProviderId: string | null;
}

export interface FuseInput {
  /** Deterministic text/lexicon analysis of the contractor's own words. */
  textResult: VisionAnalysisResult;
  /** Structured output of the multimodal provider (may be an empty state). */
  visual?: VisualUnderstandingResult | null;
  confirmedMeasurements?: ConfirmedRunMeasurement[];
}

function subjectFor(featureKey: string | null, label: string): OntologySubject | null {
  if (featureKey) {
    const direct = subjectForFeatureKey(featureKey);
    if (direct) return direct;
  }
  return matchSubject(label);
}

/**
 * Build the fused, provenance-carrying understanding of the CURRENT project.
 * Nothing here prices anything; it decides which facts are authoritative.
 */
export function fuseProjectUnderstanding(input: FuseInput): ProjectUnderstanding {
  const facts: ProjectFact[] = [];
  const claimed = new Map<string, FactAuthority>();

  const claim = (key: string, authority: FactAuthority): boolean => {
    const existing = claimed.get(key);
    if (existing && !outranks(authority, existing)) return false;
    claimed.set(key, authority);
    return true;
  };

  /* 2 — confirmed measurements. Authoritative for their own subject. */
  for (const [index, measurement] of (input.confirmedMeasurements ?? []).entries()) {
    const label = measurement.label ?? measurement.subject ?? "Measurement";
    const subject = subjectFor(null, String(label));
    const key = `measure:${subject?.subjectKey ?? label}`;
    claim(key, "confirmed_measurement");
    const feet = Number(measurement.inches) / 12;
    facts.push({
      id: `${key}:${index}`,
      subjectKey: subject?.subjectKey ?? null,
      featureKey: subject?.featureKey ?? null,
      label: String(label),
      actionKey: null,
      quantity: Number.isFinite(feet) && feet > 0 ? Math.round(feet * 100) / 100 : null,
      unitKey: "linear_foot",
      isScope: false,
      provenance: {
        authority: "confirmed_measurement",
        status: "confirmed",
        sourceType: "measurement",
        sourceId: null,
        evidence: measurement.display ?? measurement.rawText ?? null,
        confidence: 1,
      },
    });
  }


  /* 3 — the contractor's own statements: the priceable spine of the project. */
  const statementBySubject = new Map<string, ProjectFact>();
  const statementByFeature = new Map<string, ProjectFact>();
  for (const feature of collectFeatures(input.textResult)) {
    const subject = subjectFor(feature.featureKey, feature.label);
    const key = `scope:${feature.featureKey}`;
    claim(key, "contractor_statement");
    const fact: ProjectFact = {
      id: feature.id,
      subjectKey: subject?.subjectKey ?? null,
      featureKey: feature.featureKey,
      label: feature.label,
      actionKey: feature.actionKey ?? null,
      quantity: feature.quantity ?? null,
      unitKey: feature.unitKey ?? null,
      isScope: feature.scopeClass !== "observation" && feature.scopeClass !== "excluded",
      provenance: {
        authority: "contractor_statement",
        status: feature.provenance?.isDefault ? "assumed" : "confirmed",
        sourceType: "transcript",
        sourceId: null,
        evidence: feature.evidence,
        confidence: feature.confidence,
        corroboratedBy: null,
        corroboratingMediaIds: [],
      },
    };
    facts.push(fact);
    if (fact.subjectKey && !statementBySubject.has(fact.subjectKey)) {
      statementBySubject.set(fact.subjectKey, fact);
    }
    if (fact.featureKey && !statementByFeature.has(fact.featureKey)) {
      statementByFeature.set(fact.featureKey, fact);
    }
  }

  const visual = input.visual ?? null;

  /*
   * Stale observations (a newer media set is still being analyzed) stay in the
   * fused understanding: a re-analysis in flight must never blank the project's
   * evidence. Only a completed run replaces them.
   */
  const visualUsable =
    !!visual &&
    (visual.status === "ok" ||
      (visual.status === "analyzing" && visual.observations.length > 0));

  /* 5 — visual evidence. Candidates and conditions only; never overrides above. */
  if (visual && visualUsable) {

    for (const observation of visual.observations) {
      const subject = observation.subjectKey
        ? ontologySubject(observation.subjectKey)
        : matchSubject(observation.object);
      const phrase = `${observation.actionKey ?? ""} ${observation.object} ${observation.note ?? ""}`;
      /*
       * ACTION + OBJECT gate applies to vision exactly as it applies to text:
       * seeing a range hood in a photo is not "install range hood".
       */
      const gate = subject ? evaluateWorkCandidate(subject, phrase) : null;
      const isScopeCandidate =
        !!subject && !!gate?.createsWork && observation.nature !== "observed_existing";
      const key = `scope:${subject?.featureKey ?? observation.object}`;
      const accepted = isScopeCandidate ? claim(key, "visual_observation") : false;

      /*
       * CORROBORATION (Phase 1). When the photo agrees with something the
       * contractor already stated, the STATEMENT gets stronger. The photo
       * still cannot create scope, set a quantity, or set a price.
       */
      const corroborated =
        (subject?.featureKey ? statementByFeature.get(subject.featureKey) : undefined) ??
        (subject?.subjectKey ? statementBySubject.get(subject.subjectKey) : undefined);
      if (corroborated) {
        const provenance = corroborated.provenance;
        provenance.corroboratedBy = "visual_observation";
        provenance.corroboratingMediaIds = [
          ...new Set([...(provenance.corroboratingMediaIds ?? []), ...observation.mediaIds]),
        ];
        /* Capped uplift: corroboration sharpens confidence, it never certifies. */
        provenance.confidence = Math.min(
          CORROBORATION_CONFIDENCE_CAP,
          Math.max(provenance.confidence, provenance.confidence + 0.1 * observation.confidence),
        );
      }

      facts.push({
        id: `visual:${observation.object}:${observation.mediaIds.join(",")}`,
        subjectKey: subject?.subjectKey ?? null,
        featureKey: accepted ? (subject?.featureKey ?? null) : null,
        label: observation.object,
        actionKey: observation.actionKey ?? gate?.action ?? null,
        quantity: null,
        unitKey: null,
        /*
         * Visual evidence NEVER becomes priced scope on its own — it is a
         * reviewable candidate. Only contractor confirmation promotes it.
         */
        isScope: false,
        candidateStatus: accepted ? "awaiting_confirmation" : "context_only",
        provenance: {
          authority: "visual_observation",
          status: observation.nature === "design_intent" ? "design_intent" : "inferred",
          sourceType: observation.mediaIds.length ? "media" : "vision_model",
          sourceId: observation.mediaIds[0] ?? null,
          evidence: observation.note,
          confidence: observation.confidence,
        },
      });

    }

    for (const transformation of visual.transformations) {
      facts.push({
        id: `delta:${transformation.existingObject}->${transformation.proposedObject}`,
        subjectKey: transformation.subjectKey,
        featureKey: null,
        label: `${transformation.existingObject} → ${transformation.proposedObject}`,
        actionKey: transformation.actionKey,
        quantity: null,
        unitKey: null,
        isScope: false,
        provenance: {
          authority: "visual_observation",
          status: "design_intent",
          sourceType: "after_rendering",
          sourceId: transformation.mediaIds[0] ?? null,
          evidence: transformation.note,
          confidence: transformation.confidence,
        },
      });
    }
  }

  return {
    facts,
    hiddenConditionWarnings: visual?.hiddenConditionWarnings ?? [],
    measurementTargets: visual?.measurementTargets ?? [],
    visualStatus: visual?.status ?? "no_media",
    visualProviderId: visual?.providerId ?? null,
  };
}

/** Scope facts (priceable) in authority order — the input to canonical pricing. */
export function scopeFacts(understanding: ProjectUnderstanding): ProjectFact[] {
  return understanding.facts
    .filter((f) => f.isScope && f.featureKey)
    .sort((a, b) => authorityRank(a.provenance.authority) - authorityRank(b.provenance.authority));
}

/** Visual candidates the contractor should confirm or dismiss. */
export function visualCandidates(understanding: ProjectUnderstanding): ProjectFact[] {
  return understanding.facts.filter(
    (f) => f.provenance.authority === "visual_observation" && !!f.featureKey,
  );
}
