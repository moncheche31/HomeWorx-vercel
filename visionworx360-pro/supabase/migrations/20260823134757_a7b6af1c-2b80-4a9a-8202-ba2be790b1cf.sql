ALTER TABLE public.estimate_line_items DROP CONSTRAINT IF EXISTS eli_quantity_basis_chk;
ALTER TABLE public.estimate_line_items ADD CONSTRAINT eli_quantity_basis_chk
  CHECK (quantity_basis IS NULL OR quantity_basis = ANY (ARRAY[
    'measurement','geometry_derived','contractor_entered','assumed',
    'catalog_default','size_not_count','specific_measurement','needs_evidence']));
