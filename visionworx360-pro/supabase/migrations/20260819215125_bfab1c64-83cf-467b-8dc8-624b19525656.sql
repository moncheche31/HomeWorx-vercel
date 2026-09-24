ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS pricing_method text NOT NULL DEFAULT 'overhead_profit',
  ADD COLUMN IF NOT EXISTS target_gross_margin_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_pricing_method_check;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_pricing_method_check
  CHECK (pricing_method IN ('overhead_profit','target_gross_margin'));
ALTER TABLE public.estimates
  DROP CONSTRAINT IF EXISTS estimates_target_gross_margin_check;
ALTER TABLE public.estimates
  ADD CONSTRAINT estimates_target_gross_margin_check
  CHECK (target_gross_margin_pct >= 0 AND target_gross_margin_pct < 100);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_pricing_method text NOT NULL DEFAULT 'target_gross_margin',
  ADD COLUMN IF NOT EXISTS default_target_gross_margin_pct numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS default_overhead_pct numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS default_profit_pct numeric NOT NULL DEFAULT 10;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_default_pricing_method_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_default_pricing_method_check
  CHECK (default_pricing_method IN ('overhead_profit','target_gross_margin'));
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_default_target_gross_margin_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_default_target_gross_margin_check
  CHECK (default_target_gross_margin_pct >= 0 AND default_target_gross_margin_pct < 100);
