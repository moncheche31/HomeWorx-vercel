import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { DurableBallparkSession } from "@/domains/ballpark";
import type { Json } from "@/integrations/supabase/types";
import {
  getBallparkSession,
  discardBallparkDraft,
  saveBallpark,
  saveBallparkSession,
} from "../services/ballparkSession.functions";

export function useDurableBallparkSession(estimateId: string | null) {
  const queryClient = useQueryClient();
  const getFn = useServerFn(getBallparkSession);
  const saveFn = useServerFn(saveBallparkSession);
  const saveCompleteFn = useServerFn(saveBallpark);
  const discardFn = useServerFn(discardBallparkDraft);
  const queryKey = ["ballpark-session", estimateId];
  const query = useQuery({
    queryKey,
    enabled: Boolean(estimateId),
    queryFn: () => getFn({ data: { estimateId: estimateId as string } }),
    staleTime: 0,
  });
  const persist = useMutation({
    mutationFn: (session: DurableBallparkSession) =>
      saveFn({ data: { estimateId: session.estimateId, session } }),
    onSuccess: (_result, session) => queryClient.setQueryData(queryKey, session),
  });
  const persistComplete = useMutation({
    mutationFn: ({ session, rangeSnapshot }: {
      session: DurableBallparkSession;
      rangeSnapshot: Record<string, Json | undefined>;
    }) => saveCompleteFn({ data: { estimateId: session.estimateId, session, rangeSnapshot } }),
    onSuccess: (_result, variables) => queryClient.setQueryData(queryKey, {
      ...variables.session,
      currentStage: "results",
      rangeSnapshot: variables.rangeSnapshot,
    }),
  });
  const discard = useMutation({
    mutationFn: () => discardFn({ data: { estimateId: estimateId as string } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });
  return { query, persist, persistComplete, discard };
}
