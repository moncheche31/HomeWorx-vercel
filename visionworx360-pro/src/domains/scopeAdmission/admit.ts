/**
 * THE SINGLE SCOPE ADMISSION GATE.
 *
 * Every estimating entry point (remote vision, walkthrough, ballpark intake)
 * pushes its recognition candidates through this one function. Nothing else in
 * the app is allowed to decide that work exists.
 *
 * Pure module: no React, no IO, no network.
 */

import {
  actionForSubject,
  dependenciesFor,
  isContextOnlyMention,
  ontologySubject,
  subjectForFeatureKey,
  type OntologySubject,
} from "@/domains/remoteVision/ontology";
import { splitClauses } from "@/domains/workRecognition/recognize";
import type {
  AdmissionInput,
  AdmissionResult,
  AdmittedScopeItem,
  MediaDetail,
  ScopeCandidate,
  SuggestedScopeItem,
  SuggestionCode,
} from "./types";

/**
 * Words that turn a clause into an exclusion. Rule 7: "do not replace the
 * siding" must SUPPRESS siding, not merely fail to admit it, so the subject is
 * blocked for the whole project even if another clause mentions it.
 *
 * Two strengths, because contractors also use "not" DESCRIPTIVELY:
 * "it's going to be a breakfast bar, not an island" is a description of what
 * is being built, not a decision to leave an island out. A weak negation is
 * therefore an exclusion only when it negates an ACTION on the subject.
 */
const STRONG_EXCLUSION =
  /\b(without|excluding|exclude[sd]?|omit(ting)?|skip(ping)?|leave|leaving|keep(ing)?\s+(the\s+)?existing|reuse|reusing|by others|homeowner (will|is)|owner (will|is)|sin|excluyendo)\b/i;

const WEAK_NEGATION =
  /\b(no|not|never|don'?t|do not|doesn'?t|won'?t|no\s+(vamos|se))\b/i;

const NEGATION_TRIGGER = new RegExp(
  `${STRONG_EXCLUSION.source}|${WEAK_NEGATION.source}`,
  "i",
);


/** "except the baseboard" — the part after this is still in scope. */
const EXCEPT_CLAUSE = /\b(except|other than|besides|aside from|excepto)\b/i;

/** Verbs that protect or work AROUND something rather than build it. */
const PASSIVE_TREATMENT =
  /\b(protect(ing)?|cover(ing)?|mask(ing)?|tape\s+off|avoid(ing)?|work\s+around|proteger|cubrir)\b/i;

/**
 * The contractor explicitly pointing at media as the SPEC for stated work.
 * This is the only way media may influence scope at all, and even then it only
 * refines an item that contractor intent already admitted.
 */
const MEDIA_REFERENCE =
  /\b(like|as\s+(shown|seen)\s+in|per|match(ing)?|based\s+on|same\s+as|according\s+to)\b[^.]{0,30}\b(this|that|the|these|attached)?\s*(rendering|render|photo(graph)?s?|picture|image|drawing|plan|sketch|video|mock-?up|example)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A subject alias mention. The trailing boundary is deliberately loose so a
 * conjugated form still counts ("paint" -> "painted", "insulation" ->
 * "insulations"); the leading boundary stays strict so "chase" never matches
 * "purchase".
 */
function aliasPattern(alias: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(alias).replace(/\s+/g, "\\s+")}`, "i");
}

function mentionsSubject(subject: OntologySubject, phrase: string): boolean {
  return subject.aliases.some((alias) => aliasPattern(alias).test(phrase));
}

/** Is the subject's own noun negated inside this clause? */
function clauseNegatesSubject(subject: OntologySubject, clause: string): boolean {
  if (!NEGATION_TRIGGER.test(clause)) return false;
  /*
   * A weak negation with no action verb is descriptive contrast, not an
   * exclusion ("a breakfast bar, not an island"). Only a strong exclusion
   * marker, or a negated ACTION on the subject, rules work out.
   */
  if (!STRONG_EXCLUSION.test(clause) && !actionForSubject(subject, clause)) return false;
  const except = clause.match(EXCEPT_CLAUSE);
  if (except && except.index != null) {
    /* Only the part BEFORE "except" is excluded. */
    const excluded = clause.slice(0, except.index);
    const kept = clause.slice(except.index);
    if (mentionsSubject(subject, kept)) return false;
    return mentionsSubject(subject, excluded);
  }
  return mentionsSubject(subject, clause);
}


/** Subjects the contractor ruled out anywhere in the narration. */
function excludedSubjects(text: string, subjects: OntologySubject[]): Set<string> {
  const out = new Set<string>();
  for (const clause of splitClauses(text)) {
    for (const subject of subjects) {
      if (clauseNegatesSubject(subject, clause)) out.add(subject.subjectKey);
    }
  }
  return out;
}

/**
 * Connectors that introduce a SPECIFICATION of work already stated:
 * "rebuild the deck with composite decking, vinyl railings".
 */
const SPECIFICATION_CONNECTOR =
  /\b(with|w\/|including|includes|complete with|featuring|con|incluyendo)\b/i;

/**
 * "paint it white to match the trim" names the trim as a COLOR REFERENCE, not
 * as work. A specification only counts when the subject is listed after the
 * connector with no comparison marker in between.
 */
const COMPARISON_MARKER = /\b(match(ing|es)?|like|same as|similar to|to match)\b/i;

function isSpecifiedSubject(subject: OntologySubject, sentence: string): boolean {
  const connector = sentence.match(SPECIFICATION_CONNECTOR);
  if (!connector || connector.index == null) return false;
  const after = sentence.slice(connector.index + connector[0].length);
  const mention = subject.aliases
    .map((alias) => after.search(aliasPattern(alias)))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (mention == null) return false;
  return !COMPARISON_MARKER.test(after.slice(0, mention));
}

/** "build an access door" -> exactly one. */
function statesSingular(subject: OntologySubject, clause: string): boolean {
  return subject.aliases.some((alias) =>
    new RegExp(
      `\\b(a|an|one)\\s+(?:[\\w-]+\\s+){0,2}${escapeRegExp(alias).replace(/\s+/g, "\\s+")}`,
      "i",
    ).test(clause),
  );
}

const QUESTION = (label: string) => `Should ${label.toLowerCase()} be included in this estimate?`;

function suggest(
  candidate: ScopeCandidate,
  code: SuggestionCode,
  reason: string,
): SuggestedScopeItem {
  return {
    featureKey: candidate.featureKey,
    label: candidate.label,
    code,
    reason,
    evidence: candidate.sentence,
    question: QUESTION(candidate.label),
  };
}

/**
 * Admit scope from contractor intent, then offer everything else as a
 * suggestion. Never throws; an unrecognized candidate degrades to a question.
 */
export function admitScope(input: AdmissionInput): AdmissionResult {
  const text = input.text ?? "";
  const mediaReferenced = MEDIA_REFERENCE.test(text);

  const subjectsInPlay = input.candidates
    .map((c) => subjectForFeatureKey(c.featureKey))
    .filter((s): s is OntologySubject => Boolean(s));
  const excluded = excludedSubjects(text, subjectsInPlay);

  const admitted: AdmittedScopeItem[] = [];
  const suggested: SuggestedScopeItem[] = [];
  const mediaDetails: MediaDetail[] = [];
  const deferredVision: ScopeCandidate[] = [];
  const pendingSpec: Array<{ candidate: ScopeCandidate; subject: OntologySubject; clauses: string[] }> = [];

  for (const candidate of input.candidates) {
    /* Media is REFERENCE ONLY. Decided after text admissions are known. */
    if (candidate.source === "vision") {
      deferredVision.push(candidate);
      continue;
    }

    const subject = subjectForFeatureKey(candidate.featureKey);
    if (!subject) {
      suggested.push(
        suggest(
          candidate,
          "no_subject_mapping",
          "No construction subject owns this recognition rule, so contractor intent cannot be verified.",
        ),
      );
      continue;
    }

    if (excluded.has(subject.subjectKey)) {
      suggested.push(
        suggest(candidate, "negated", "The contractor explicitly ruled this work out."),
      );
      continue;
    }

    /*
     * Rule 6 — FULL CONTEXT, clause-bound. Intent may be stated in a different
     * sentence than the one the keyword matched ("It's about six feet of the two
     * closets ... so we're removing those closets completely"), so every clause
     * of the narration is searched. The action still has to sit in the SAME
     * clause as the subject's own noun, which is what keeps nouns from becoming
     * scope on their own.
     */
    const clausePool = [
      ...splitClauses(candidate.sentence),
      ...splitClauses(text).filter((clause) => !candidate.sentence.includes(clause)),
    ];
    const clauses = clausePool.filter((clause) => mentionsSubject(subject, clause));
    if (clauses.length === 0) {
      suggested.push(
        suggest(
          candidate,
          "subject_not_in_clause",
          `The contractor never named ${candidate.label.toLowerCase()} — a related keyword matched instead.`,
        ),
      );
      continue;
    }


    let admittedHere = false;
    for (const clause of clauses) {
      if (isContextOnlyMention(subject, clause)) continue;
      if (PASSIVE_TREATMENT.test(clause) && !mentionsSubject(subject, clause.replace(PASSIVE_TREATMENT, ""))) {
        continue;
      }
      const action = actionForSubject(subject, clause);
      if (!action) continue;
      /* Protecting or working around something is not work ON it. */
      if (PASSIVE_TREATMENT.test(clause) && action !== "clean") {
        const withoutPassive = clause.replace(PASSIVE_TREATMENT, " ");
        if (!actionForSubject(subject, withoutPassive)) continue;
      }
      admitted.push({
        featureKey: candidate.featureKey,
        label: candidate.label,
        subjectKey: subject.subjectKey,
        path: "contractor_intent",
        action,
        clause,
        sentence: candidate.sentence,
        reason: `Contractor stated "${action}" for ${candidate.label.toLowerCase()} in the same clause.`,
        requiredBy: null,
        singularCount: statesSingular(subject, clause),
      });
      admittedHere = true;
      break;
    }
    if (admittedHere) continue;

    /*
     * SPECIFICATION OF ADMITTED WORK is decided after every clause-level
     * intent admission is known, since the owning work ("rebuild the deck")
     * is often stated in a later sentence than the specification.
     */
    /*
     * Clause splitting cuts on commas, so a specification list
     * ("with composite decking, vinyl railings") leaves the connector in an
     * earlier clause. The whole sentence is therefore the unit of evidence.
     */
    const specSentences = [candidate.sentence, ...clauses].filter((s) =>
      SPECIFICATION_CONNECTOR.test(s),
    );
    if (specSentences.length > 0) {
      pendingSpec.push({ candidate, subject, clauses: specSentences });
      continue;
    }

    const contextOnly = clauses.every((clause) => isContextOnlyMention(subject, clause));
    suggested.push(
      suggest(
        candidate,
        contextOnly ? "context_only" : "no_action_in_clause",
        contextOnly
          ? `${candidate.label} was named as a location or a reference, not as work to perform.`
          : `${candidate.label} was mentioned, but the contractor stated no work on it.`,
      ),
    );
  }


  /* ------------------------------------ specification of admitted work */
  for (const pending of pendingSpec) {
    const specClause = pending.clauses.find(
      (clause) =>
        SPECIFICATION_CONNECTOR.test(clause) &&
        isSpecifiedSubject(pending.subject, clause) &&
        admitted.some((a) => {
          const owner = ontologySubject(a.subjectKey);
          return owner != null && owner.subjectKey !== pending.subject.subjectKey && mentionsSubject(owner, clause);
        }),
    );
    if (!specClause) {
      suggested.push(
        suggest(
          pending.candidate,
          "no_action_in_clause",
          `${pending.candidate.label} was mentioned, but the contractor stated no work on it.`,
        ),
      );
      continue;
    }
    const owner = admitted.find((a) => {
      const s = ontologySubject(a.subjectKey);
      return s != null && s.subjectKey !== pending.subject.subjectKey && mentionsSubject(s, specClause);
    });
    admitted.push({
      featureKey: pending.candidate.featureKey,
      label: pending.candidate.label,
      subjectKey: pending.subject.subjectKey,
      path: "contractor_intent",
      action: pending.subject.actions.includes("install") ? "install" : (owner?.action ?? "install"),
      clause: specClause,
      sentence: pending.candidate.sentence,
      reason: `Specified as part of the ${owner?.label.toLowerCase() ?? "stated"} work in the same clause.`,
      requiredBy: owner?.featureKey ?? null,
      singularCount: statesSingular(pending.subject, specClause),
    });
  }

  /* ------------------------------------------------- media, second pass */
  const admittedKeys = new Set(admitted.map((a) => a.featureKey));
  for (const candidate of deferredVision) {
    if (mediaReferenced && admittedKeys.has(candidate.featureKey)) {
      mediaDetails.push({
        featureKey: candidate.featureKey,
        label: candidate.label,
        evidence: candidate.sentence,
        reason:
          "The contractor referenced this media as the spec for work they already requested, so it refines the details of that item only.",
      });
      continue;
    }
    suggested.push(
      suggest(
        candidate,
        "media_only",
        "Visible in the uploaded media but never requested by the contractor. Media is reference only.",
      ),
    );
  }

  /* ------------------------------------------- construction dependencies */
  const DEP_CODES: Record<string, SuggestionCode> = {
    required: "dependency_required",
    likely: "dependency_likely",
    optional: "dependency_optional",
    unknown: "dependency_unknown",
  };
  for (const item of [...admitted]) {
    for (const dependency of dependenciesFor(item.subjectKey, [
      "required",
      "likely",
      "optional",
      "unknown",
    ])) {
      const subject = ontologySubject(dependency.subjectKey);
      if (!subject) continue;
      if (excluded.has(subject.subjectKey)) continue;
      if (admitted.some((a) => a.subjectKey === subject.subjectKey)) continue;
      const featureKey = subject.featureKey ?? null;
      if (suggested.some((s) => s.featureKey === featureKey && s.requiredBy === item.featureKey)) {
        continue;
      }
      suggested.push({
        featureKey,
        label: subject.subjectKey.split(".").pop()?.replace(/_/g, " ") ?? subject.subjectKey,
        code: DEP_CODES[dependency.strength] ?? "dependency_unknown",
        reason: `Included for review because the contractor requested ${item.label.toLowerCase()} and this is ${dependency.strength === "required" ? "normally required" : "often needed"} to execute it: ${dependency.reason}`,
        evidence: item.clause,
        question: `The contractor asked for ${item.label.toLowerCase()}. Include ${subject.subjectKey.split(".").pop()?.replace(/_/g, " ")}?`,
        requiredBy: item.featureKey,
      });
    }
  }

  return {
    admitted,
    suggested,
    mediaDetails,
    excludedSubjectKeys: [...excluded],
    mediaReferenced,
  };
}
