CREATE OR REPLACE FUNCTION public.sync_estimate_ballpark_after_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  FOR v_id IN
    SELECT DISTINCT estimate_id FROM changed_lines WHERE estimate_id IS NOT NULL
  LOOP
    /* Only refresh a band that already exists; never invent one. */
    IF EXISTS (
      SELECT 1 FROM public.estimates e
      WHERE e.id = v_id
        AND e.range_snapshot IS NOT NULL
        AND e.range_snapshot <> '{}'::jsonb
    ) THEN
      PERFORM public.rebuild_estimate_ballpark(v_id);
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS zzz_estimate_lines_sync_ballpark_ins ON public.estimate_line_items;
DROP TRIGGER IF EXISTS zzz_estimate_lines_sync_ballpark_upd ON public.estimate_line_items;
DROP TRIGGER IF EXISTS zzz_estimate_lines_sync_ballpark_del ON public.estimate_line_items;

CREATE TRIGGER zzz_estimate_lines_sync_ballpark_ins
AFTER INSERT ON public.estimate_line_items
REFERENCING NEW TABLE AS changed_lines
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_estimate_ballpark_after_lines();

CREATE TRIGGER zzz_estimate_lines_sync_ballpark_upd
AFTER UPDATE ON public.estimate_line_items
REFERENCING NEW TABLE AS changed_lines
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_estimate_ballpark_after_lines();

CREATE TRIGGER zzz_estimate_lines_sync_ballpark_del
AFTER DELETE ON public.estimate_line_items
REFERENCING OLD TABLE AS changed_lines
FOR EACH STATEMENT EXECUTE FUNCTION public.sync_estimate_ballpark_after_lines();
