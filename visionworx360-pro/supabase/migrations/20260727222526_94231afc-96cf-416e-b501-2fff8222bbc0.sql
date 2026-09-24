
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS primary_business_type text,
  ADD COLUMN IF NOT EXISTS secondary_business_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS service_specialties text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_project_scale text;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_primary_business_type_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_primary_business_type_check
  CHECK (primary_business_type IS NULL OR primary_business_type IN (
    'GENERAL_REMODELING','HANDYMAN','GENERAL_CONTRACTOR','KITCHEN_BATH','PAINTING',
    'ROOFING','EXTERIOR_CONTRACTOR','DECKS_OUTDOOR_LIVING','ELECTRICAL','PLUMBING',
    'HVAC','FLOORING','WINDOWS_DOORS','MASONRY','RESTORATION',
    'ACCESSIBILITY_AGING_IN_PLACE','NEW_CONSTRUCTION','DESIGN_BUILD',
    'PROPERTY_MAINTENANCE','OTHER'
  ));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_preferred_project_scale_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_preferred_project_scale_check
  CHECK (preferred_project_scale IS NULL OR preferred_project_scale IN (
    'QUICK_REPAIR','HALF_DAY','FULL_DAY','MULTI_DAY_SMALL_PROJECT',
    'REMODEL','MAJOR_RENOVATION','NEW_CONSTRUCTION','ALL_SIZES'
  ));

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_scale_key text;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_project_scale_key_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_project_scale_key_check
  CHECK (project_scale_key IS NULL OR project_scale_key IN (
    'QUICK_REPAIR','HALF_DAY','FULL_DAY','MULTI_DAY_SMALL_PROJECT',
    'REMODEL','MAJOR_RENOVATION','NEW_CONSTRUCTION'
  ));
