import { useCallback, useEffect, useRef, useState } from "react";
import type { WalkthroughSessionSnapshot } from "@/domains/walkthrough";

/**
 * Walkthrough session recovery — strictly scoped to one project.
 *
 * REGRESSION GUARD: the previous implementation stored every walkthrough under
 * a single global key, so opening a brand-new project restored the previous
 * project's step, drafts, answers and generated questions (the "same 19
 * questions" bug). Every snapshot is now written under a project-specific key
 * and is only ever read back for that same project id.
 */

const PREFIX = "vwx.walkthrough.session.v2.";
/** Pre-isolation global key; migrated once, then deleted. */
const LEGACY_KEY = "vwx.walkthrough.session.v1";

export function walkthroughStorageKey(projectId: string): string {
  return `${PREFIX}${projectId}`;
}

function parse(raw: string | null, projectId: string): WalkthroughSessionSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as WalkthroughSessionSnapshot;
    if (!parsed || parsed.version !== 2) return null;
    // Belt and braces: never hand back another project's session.
    return parsed.projectId === projectId ? parsed : null;
  } catch {
    return null;
  }
}

/** One-time move of a legacy global snapshot into its own project bucket. */
function migrateLegacy(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    window.localStorage.removeItem(LEGACY_KEY);
    const legacy = JSON.parse(raw) as WalkthroughSessionSnapshot & { version: number };
    if (!legacy?.projectId) return;
    const migrated = { ...legacy, version: 2 as const };
    window.localStorage.setItem(walkthroughStorageKey(legacy.projectId), JSON.stringify(migrated));
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

export function readWalkthroughSession(projectId: string | null): WalkthroughSessionSnapshot | null {
  if (!projectId || typeof window === "undefined") return null;
  try {
    return parse(window.localStorage.getItem(walkthroughStorageKey(projectId)), projectId);
  } catch {
    return null;
  }
}

export function useWalkthroughSessionStore(projectId: string | null) {
  const [restored, setRestored] = useState<WalkthroughSessionSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const latest = useRef<WalkthroughSessionSnapshot | null>(null);

  useEffect(() => {
    setHydrated(false);
    migrateLegacy();
    const found = readWalkthroughSession(projectId);
    latest.current = found;
    setRestored(found);
    setHydrated(true);
  }, [projectId]);

  const save = useCallback(
    (snapshot: Omit<WalkthroughSessionSnapshot, "version" | "updatedAt">) => {
      if (typeof window === "undefined") return;
      // Only ever persist under the snapshot's own project id.
      if (!snapshot.projectId) return;
      const full: WalkthroughSessionSnapshot = {
        ...snapshot,
        version: 2,
        updatedAt: new Date().toISOString(),
      };
      latest.current = full;
      try {
        window.localStorage.setItem(walkthroughStorageKey(snapshot.projectId), JSON.stringify(full));
      } catch {
        /* storage unavailable — the walkthrough still works in memory */
      }
    },
    [],
  );

  const clear = useCallback(() => {
    latest.current = null;
    setRestored(null);
    if (typeof window === "undefined" || !projectId) return;
    try {
      window.localStorage.removeItem(walkthroughStorageKey(projectId));
    } catch {
      /* ignore */
    }
  }, [projectId]);

  return { restored, hydrated, save, clear };
}

export function peekWalkthroughSession(
  projectId: string | null,
): WalkthroughSessionSnapshot | null {
  return readWalkthroughSession(projectId);
}
