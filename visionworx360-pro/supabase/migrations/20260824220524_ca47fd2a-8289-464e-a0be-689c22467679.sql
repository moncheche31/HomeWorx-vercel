CREATE OR REPLACE FUNCTION public.sync_estimate_ballpark_after_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_snapshot jsonb;
  v_has_lines boolean;
BEGIN
  FOR v_id IN
    SELECT DISTINCT estimate_id FROM changed_lines WHERE estimate_id IS NOT NULL
  LOOP
    SELECT e.range_snapshot INTO v_snapshot
      FROM public.estimates e WHERE e.id = v_id;

    /* Only refresh a band that already exists; never invent one. */
    CONTINUE WHEN v_snapshot IS NULL OR v_snapshot = '{}'::jsonb;

    SELECT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = v_id AND li.archived_at IS NULL
    ) INTO v_has_lines;

    IF v_has_lines OR COALESCE(v_snapshot->>'source','') = 'canonical_lines' THEN
      /* Canonical estimate lines own the price. Flag for a canonical refresh
         instead of writing a second engine's band over the authoritative one. */
      UPDATE public.estimates
         SET range_snapshot = jsonb_set(
               range_snapshot, '{needsCanonicalRefresh}', 'true'::jsonb, true)
       WHERE id = v_id
         AND COALESCE(range_snapshot->>'needsCanonicalRefresh','') <> 'true';
    ELSE
      PERFORM public.rebuild_estimate_ballpark(v_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $function$;
