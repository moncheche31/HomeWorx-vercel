import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SIGNUP_ACCEPTANCE_DOCUMENTS } from "@/domains/legal/documents";
import { recordLegalAcceptance } from "./services/legal.functions";

const PENDING_KEY = "vwx.legal.pendingAcceptance";

interface PendingAcceptance {
  locale: string;
  documents: { documentKey: string; documentVersion: string }[];
}

/** Queue the signup acceptance locally until an authenticated session exists. */
export function queueSignupLegalAcceptance(locale: string) {
  if (typeof window === "undefined") return;
  const payload: PendingAcceptance = { locale, documents: SIGNUP_ACCEPTANCE_DOCUMENTS };
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* Storage disabled: acceptance is re-queued on the next signed-in load. */
  }
}

export function readPendingLegalAcceptance(): PendingAcceptance | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAcceptance;
    if (!Array.isArray(parsed?.documents) || parsed.documents.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingLegalAcceptance() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Flushes a queued signup acceptance once the user is authenticated.
 * The server function is idempotent, so a retry can never duplicate a record.
 */
export function usePendingLegalAcceptance(enabled: boolean) {
  const record = useServerFn(recordLegalAcceptance);
  const sent = useRef(false);

  useEffect(() => {
    if (!enabled || sent.current) return;
    const pending = readPendingLegalAcceptance();
    if (!pending) return;
    sent.current = true;
    void record({ data: pending })
      .then(() => clearPendingLegalAcceptance())
      .catch(() => {
        /* Left queued; retried on the next signed-in load. */
        sent.current = false;
      });
  }, [enabled, record]);
}
