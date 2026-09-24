import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { estimateFromProjectNarration } from "../services/narrationEstimate.functions";
import { useOptionalScopeItemsQuery } from "@/features/scope/hooks/useScope";

/**
 * A described job must never display $0.
 *
 * When a project carries a spoken scope narration but no structured scope, the
 * estimate has nothing to price. This runs the canonical narration -> scope ->
 * NCE 2026 book pricing recovery exactly once per project, then refreshes the
 * estimating caches. It is a no-op as soon as real scope exists.
 */
export function useNarrationScopeRecovery(
  projectId: string | undefined,
  opts: { enabled: boolean },
) {
  const qc = useQueryClient();
  const recover = useServerFn(estimateFromProjectNarration);
  const scopeItems = useOptionalScopeItemsQuery(projectId, { includedOnly: true });
  const attempted = useRef<string | null>(null);
  const [running, setRunning] = useState(false);

  const noScope = !scopeItems.isLoading && (scopeItems.data ?? []).length === 0;
  const ready = Boolean(projectId) && opts.enabled && noScope;

  useEffect(() => {
    if (!ready || !projectId) return;
    if (attempted.current === projectId) return;
    attempted.current = projectId;
    let cancelled = false;
    setRunning(true);
    void (async () => {
      try {
        const result = await recover({ data: { projectId } });
        if (cancelled) return;
        if (result?.recovered) {
          qc.invalidateQueries({ queryKey: ["estimating"] });
          qc.invalidateQueries({ queryKey: ["scope"] });
          qc.invalidateQueries({ queryKey: ["projects"] });
        }
      } catch {
        /* Recovery is best-effort; the estimate stays exactly as saved. */
      } finally {
        if (!cancelled) setRunning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, projectId, recover, qc]);

  return { running };
}
