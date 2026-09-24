/**
 * Debounced, per-project trigger for surface-independent vision analysis.
 *
 * An upload burst (three photos picked at once) is one media-set change, not
 * three: the scheduler coalesces it into a single server call. The server
 * function is idempotent and fingerprint-guarded anyway, so a duplicate
 * trigger can never double-charge.
 */

export const ANALYSIS_TRIGGER_DEBOUNCE_MS = 2_500;

type Timer = ReturnType<typeof setTimeout>;
const timers = new Map<string, Timer>();

export function scheduleProjectMediaAnalysis(
  projectId: string,
  run: (projectId: string) => Promise<unknown>,
  delayMs: number = ANALYSIS_TRIGGER_DEBOUNCE_MS,
): void {
  if (!projectId) return;
  const existing = timers.get(projectId);
  if (existing) clearTimeout(existing);
  timers.set(
    projectId,
    setTimeout(() => {
      timers.delete(projectId);
      /* Analysis is best-effort: a failure must never surface as an upload error. */
      void Promise.resolve(run(projectId)).catch(() => undefined);
    }, delayMs),
  );
}

/** Test helper: drop any pending timers. */
export function resetAnalysisScheduler(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}
