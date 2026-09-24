ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS assembly_geometry jsonb,
  ADD COLUMN IF NOT EXISTS assembly_component_quantities jsonb;
