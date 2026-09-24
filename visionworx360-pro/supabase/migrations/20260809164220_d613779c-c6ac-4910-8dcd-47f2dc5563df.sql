UPDATE public.scope_items
SET archived_at = now(), is_included = false, updated_at = now()
WHERE project_id = '70b778fc-07e8-42ac-8e7e-b992d85a53af'
  AND archived_at IS NULL
  AND id IN (
    '9c4bc8cf-d19c-430c-8faf-814b34652803',
    '7b96a81a-51f2-4f8f-9f06-c725356ebd5a',
    'e0ecaf12-6e9d-45c0-8e31-102c15a25fcb',
    'da0492c1-4265-4043-a6f2-f11dcd6ae619',
    '87d3325b-43bc-4d8e-8d98-fa6f986a9a60',
    '864c7c9b-5a7b-4af4-a8a8-bad0a9f116f7',
    '7c357412-fe3d-4410-b728-665f20233e9c',
    '0dcd67dd-039f-470c-97ce-53620c8916d2',
    '97589e94-8937-4874-9e1e-7c3e26e5eb2f',
    '130a43ae-1d2d-4dff-bc99-17db4ab691d3',
    '02e015f1-664c-494e-b012-395c69d5098f'
  );

UPDATE public.scope_items
SET quantity = 1,
    unit_key = 'each',
    internal_notes = trim(both E'\n' FROM coalesce(internal_notes, '') || E'\nVanity width: 60 in. A size is never a count — this line is 1 vanity.'),
    updated_at = now()
WHERE id = '7bacf249-1e43-4836-b604-72eaa40b8d83';

UPDATE public.estimates e
SET range_snapshot = jsonb_build_object(
      'kind', 'ballpark',
      'source', 'scope_recalc',
      'savedAt', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'currency', 'USD',
      'band', jsonb_build_object('low', 19000, 'expected', 30644.73, 'high', 44500),
      'confidence', 'low',
      'pricedCount', 12,
      'assumedCount', 8,
      'needsReview', false,
      'unpriceable', jsonb_build_array(
        jsonb_build_object('itemId', '77c62527-8634-47d5-975a-3afac320ce3d', 'title', 'Insulate walls, ceiling, floor', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', '50d36f46-c916-4b7c-be5b-f23b4f1991dc', 'title', 'Prime and paint trim', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', 'da595158-4074-4d94-82be-b5239279281b', 'title', 'Extend HVAC to new space', 'reason', 'noMapping'),
        jsonb_build_object('itemId', '06f5a3ce-2b01-4bd3-8983-104154a677be', 'title', 'Install finished flooring', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', '488d9b3c-d264-4213-8a6b-02f2322bde18', 'title', 'Frame walls to code', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', '350ddf2e-9cee-4b28-8995-9f99b023b58f', 'title', 'Hang, tape, finish drywall', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', '9e60843f-45de-4265-ab50-fa7db99d431c', 'title', 'Hardwood Flooring', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', 'cb7e7213-cd5d-4b0d-a364-8b16521f17f3', 'title', 'Prime and paint walls and ceilings', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', '9b310ace-623b-45a1-9990-5716b7f102b4', 'title', 'Install new shutoffs and supply lines', 'reason', 'noMapping'),
        jsonb_build_object('itemId', '855b926c-d61f-4025-8717-746ddee5bb98', 'title', 'Paint walls and ceilings', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', 'c29ba266-e588-4a0e-bf37-b29e7f23c5eb', 'title', 'Install/replace baseboards', 'reason', 'noQuantity'),
        jsonb_build_object('itemId', 'd06a45af-021f-4b8b-ae0f-85b0042e7b53', 'title', 'Remove existing garage partition wall', 'reason', 'noQuantity')
      ),
      'previous', (e.range_snapshot - 'previous' - 'originalBallpark'),
      'originalBallpark', coalesce(e.range_snapshot -> 'originalBallpark', e.range_snapshot - 'previous' - 'originalBallpark')
    ),
    updated_at = now()
WHERE e.id = '1d815f3b-6241-40d7-b695-6c8374458dc8'
  AND e.locked_at IS NULL
  AND e.superseded_by_id IS NULL;
