ALTER TABLE public.catalog_assemblies
  ADD COLUMN IF NOT EXISTS is_composite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geometry_basis text,
  ADD COLUMN IF NOT EXISTS ballpark_allowance_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS finish_tier_applies boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_cost_low numeric,
  ADD COLUMN IF NOT EXISTS material_cost_high numeric,
  ADD COLUMN IF NOT EXISTS source_version text;

COMMENT ON COLUMN public.catalog_assemblies.geometry_basis IS
  'Project geometry a quantity may be derived from (floor_area, wall_area, ceiling_area, perimeter_lf, partition_lf, roof_area, facade_area). NULL means the quantity must come from a count or a task-specific measurement — never from generic project geometry.';
COMMENT ON COLUMN public.catalog_assemblies.is_composite IS
  'True when the assembly stands for several materially different parts and must be decomposed or priced as a labelled allowance rather than as one unit.';

INSERT INTO public.catalog_library_versions (version, name, notes, is_current)
VALUES (2, 'Residential Core v2', 'Residential remodeling core knowledge base: general conditions, demolition, framing, drywall, paint, flooring, tile, plumbing, electrical, HVAC, insulation, doors and windows, finish carpentry, cabinets and countertops, roofing, siding, gutters, concrete, masonry, decks, handyman and site work. Sample productivity and material allowances — replaceable by licensed regional data.', false)
ON CONFLICT (version) DO NOTHING;
