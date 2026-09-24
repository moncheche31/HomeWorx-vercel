ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'total';

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_pricing_mode_check;

ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_pricing_mode_check
  CHECK (pricing_mode IN ('total', 'labor_materials', 'labor_only'));

COMMENT ON COLUMN public.estimates.pricing_mode IS
  'How the job is sold: total (one price), labor_materials (split shown), labor_only (owner supplies materials; material sell excluded). Presentation only - scope and quantities are identical in every mode.';
