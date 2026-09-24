import { useCallback, useEffect, useState } from "react";
import type { CopilotDecision, CopilotDecisionMap } from "@/domains/copilot";

const KEY = "vwx.copilot.decisions";

interface StoredState {
  decisions: CopilotDecisionMap;
  /** Set when the contractor finished the review. */
  reviewedAt: string | null;
  updatedAt: string;
}

const empty = (): StoredState => ({ decisions: {}, reviewedAt: null, updatedAt: new Date().toISOString() });

/**
 * Local-first persistence (same approach as Modules 009 / 010B / 011).
 * The Copilot never writes to the scope or estimate tables — the contractor's
 * accept / remove decisions live with the device until they act on them.
 */
export function useCopilotDecisionStore(projectId: string) {
  const storageKey = `${KEY}.${projectId}`;
  const [state, setState] = useState<StoredState>(() => empty());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setState(raw ? (JSON.parse(raw) as StoredState) : empty());
    } catch {
      setState(empty());
    }
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next: StoredState) => {
      setState(next);
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable — decisions still work in memory */
      }
    },
    [storageKey],
  );

  const setDecision = useCallback(
    (id: string, decision: CopilotDecision) =>
      persist({
        ...state,
        decisions: { ...state.decisions, [id]: decision },
        updatedAt: new Date().toISOString(),
      }),
    [persist, state],
  );

  const setMany = useCallback(
    (ids: string[], decision: CopilotDecision) => {
      const next = { ...state.decisions };
      for (const id of ids) next[id] = decision;
      persist({ ...state, decisions: next, updatedAt: new Date().toISOString() });
    },
    [persist, state],
  );

  const markReviewed = useCallback(
    () => persist({ ...state, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
    [persist, state],
  );

  const reset = useCallback(() => persist(empty()), [persist]);

  return { decisions: state.decisions, reviewedAt: state.reviewedAt, hydrated, setDecision, setMany, markReviewed, reset };
}
