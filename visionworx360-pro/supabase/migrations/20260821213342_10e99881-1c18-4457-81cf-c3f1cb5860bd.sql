-- Live repair: project "Kitchen Cabinet adds" (a8de7d84-c37d-426d-8faa-eb957a6392e5),
-- estimate f390f9e1-b833-4edc-b3aa-197812013e99.
--
-- The saved ballpark band ($2,600 / $4,325.76 / $6,300) was priced entirely
-- from assumed placeholder quantities (door.interior, window.unit,
-- electrical.moderate) with zero dimensions and isSampleData = true. It does
-- not describe cabinet work, so the number is NOT forced to match anything.
-- It is flagged for contractor review, with the original band preserved
-- verbatim as history.
UPDATE public.estimates
SET range_snapshot = range_snapshot
      || jsonb_build_object(
           'needsReview', true,
           'reviewReason', 'scopeNeedsReview',
           'unresolvedScopeCount', 0,
           'reviewNote', 'Band was priced from placeholder interview quantities, not from this project''s scope.',
           'reviewFlaggedAt', now()::text,
           'originalBallpark', coalesce(range_snapshot->'originalBallpark', range_snapshot)
         ),
    updated_at = now()
WHERE id = 'f390f9e1-b833-4edc-b3aa-197812013e99'
  AND project_id = 'a8de7d84-c37d-426d-8faa-eb957a6392e5';
