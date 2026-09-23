-- TEST HARNESS ONLY — PRODUCTION SCHEMA DRIFT.
-- These three tables exist in the live VisionWorx360 Pro database but are NOT
-- created by any file in supabase/migrations (they were loaded out-of-band).
-- 13 later migrations reference them, so a database rebuilt from migrations
-- alone cannot be built without them. DDL copied from the live catalog
-- (pg_attribute / pg_get_indexdef) in the shape it had BEFORE migration
-- 20260828141907 added zip_low/zip_high/is_state_average (which it does with
-- ADD COLUMN IF NOT EXISTS). Tables are left EMPTY: no book cost data is
-- needed to test pricing-method inheritance.
CREATE SEQUENCE IF NOT EXISTS public.cost_reference_nce2026_id_seq;
CREATE TABLE IF NOT EXISTS public.cost_reference_nce2026 (
  id integer DEFAULT nextval('public.cost_reference_nce2026_id_seq'::regclass) NOT NULL PRIMARY KEY,
  description text NOT NULL,
  craft_hours text,
  unit text,
  material numeric,
  labor numeric,
  equipment numeric,
  total numeric,
  section text,
  source_version text DEFAULT 'nce-2026'::text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cost_reference_description ON public.cost_reference_nce2026 USING gin (to_tsvector('english'::regconfig, description));
CREATE INDEX IF NOT EXISTS idx_cost_reference_section ON public.cost_reference_nce2026 USING btree (section);

CREATE SEQUENCE IF NOT EXISTS public.area_modification_factors_nce2026_id_seq;
CREATE TABLE IF NOT EXISTS public.area_modification_factors_nce2026 (
  id integer DEFAULT nextval('public.area_modification_factors_nce2026_id_seq'::regclass) NOT NULL PRIMARY KEY,
  location text NOT NULL,
  zip_prefix text,
  material_pct numeric,
  labor_pct numeric,
  equipment_pct numeric,
  total_weighted_avg_pct numeric,
  source_version text DEFAULT 'nce-2026'::text
);
CREATE INDEX IF NOT EXISTS idx_nce_area_location ON public.area_modification_factors_nce2026 USING btree (lower(location));

CREATE SEQUENCE IF NOT EXISTS public.labor_wage_rates_nce2026_id_seq;
CREATE TABLE IF NOT EXISTS public.labor_wage_rates_nce2026 (
  id integer DEFAULT nextval('public.labor_wage_rates_nce2026_id_seq'::regclass) NOT NULL PRIMARY KEY,
  craft text NOT NULL,
  base_wage_per_hour numeric,
  taxable_fringe_benefits numeric,
  insurance_and_taxes_pct numeric,
  insurance_and_taxes_dollars numeric,
  nontaxable_fringe_benefits numeric,
  total_hourly_cost numeric,
  source_version text DEFAULT 'nce-2026'::text
);
