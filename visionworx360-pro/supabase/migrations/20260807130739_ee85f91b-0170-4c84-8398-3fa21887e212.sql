-- Repair: a detailed preliminary range previously overwrote the saved ballpark
-- band on estimates.range_snapshot. Carry the original ballpark snapshot (still
-- held by the interview session) back under range_snapshot->'ballpark' so it
-- stays available as immutable historical reference. Values are copied, never
-- recalculated.
UPDATE public.estimates e
SET range_snapshot = COALESCE(e.range_snapshot, '{}'::jsonb) || jsonb_build_object('ballpark', s.range_snapshot)
FROM public.estimate_ballpark_sessions s
WHERE s.estimate_id = e.id
  AND s.range_snapshot IS NOT NULL
  AND s.range_snapshot ? 'band'
  AND (e.range_snapshot IS NULL
       OR (NOT (e.range_snapshot ? 'band') AND NOT (e.range_snapshot ? 'ballpark')));
