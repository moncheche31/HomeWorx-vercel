/**
 * Scope admission — the ONE gate between recognition and any consumer that
 * writes narrative scope, structured scope or priced estimate inputs.
 */

export { admitScope } from "./admit";
export { routePunchList, type PunchListRouting } from "./punchList";
export type {
  AdmissionInput,
  AdmissionPath,
  AdmissionResult,
  AdmittedScopeItem,
  MediaDetail,
  ScopeCandidate,
  SuggestedScopeItem,
  SuggestionCode,
} from "./types";
