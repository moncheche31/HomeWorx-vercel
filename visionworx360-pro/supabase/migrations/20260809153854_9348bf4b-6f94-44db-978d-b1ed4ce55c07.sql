UPDATE public.estimates
SET range_snapshot = (range_snapshot -> 'previous')
  || jsonb_build_object(
       'needsReview', true,
       'reviewReason', 'scopeNeedsReview',
       'unresolvedScopeCount', 1,
       'restoredAt', to_jsonb(now()),
       'restoredFrom', 'implausible-quantity-recalculation'
     )
WHERE id = '1d815f3b-6241-40d7-b695-6c8374458dc8'
  AND range_snapshot ? 'previous'
  AND (range_snapshot -> 'previous' -> 'band' ->> 'expected')::numeric = 38809.02;
