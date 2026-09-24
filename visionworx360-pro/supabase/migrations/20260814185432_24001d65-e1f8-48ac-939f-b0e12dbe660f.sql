ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_labor_rate numeric NOT NULL DEFAULT 85,
  ADD COLUMN IF NOT EXISTS default_productivity_multiplier numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS default_crew_size numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS default_productive_hours_per_day numeric NOT NULL DEFAULT 6.5;

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS labor_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
