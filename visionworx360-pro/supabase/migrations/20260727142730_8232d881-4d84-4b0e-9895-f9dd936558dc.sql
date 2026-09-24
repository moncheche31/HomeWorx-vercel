ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS license_state text,
  ADD COLUMN IF NOT EXISTS primary_trade text;
