ALTER TABLE public.assembly_expansion_components
  ADD COLUMN IF NOT EXISTS selected_reference_id integer,
  ADD COLUMN IF NOT EXISTS selected_by uuid,
  ADD COLUMN IF NOT EXISTS selected_at timestamp with time zone;
