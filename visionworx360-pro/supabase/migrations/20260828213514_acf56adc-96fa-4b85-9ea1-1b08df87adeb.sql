ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS parent_line_id uuid REFERENCES public.estimate_line_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assembly_component_id uuid REFERENCES public.assembly_expansion_components(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eli_parent_line ON public.estimate_line_items(parent_line_id) WHERE parent_line_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eli_assembly_component ON public.estimate_line_items(assembly_component_id) WHERE assembly_component_id IS NOT NULL;
