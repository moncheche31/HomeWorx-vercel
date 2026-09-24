ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS intake_mode text NOT NULL DEFAULT 'detailed';

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_intake_mode_check;

ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_intake_mode_check CHECK (intake_mode IN ('ballpark','detailed'));
