-- One-time workspace-wide sweep using the generic routine (no per-project logic).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public.repair_labor_hours(NULL, false) LOOP
    RAISE NOTICE 'labor-hours %: % (% -> %)', r.action, r.description, r.old_hours, r.new_hours;
  END LOOP;
END $$;
