ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS range_assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS range_snapshot jsonb;
