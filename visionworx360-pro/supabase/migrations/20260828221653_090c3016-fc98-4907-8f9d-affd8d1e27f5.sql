ALTER TABLE public.assembly_expansion_components
  DROP CONSTRAINT IF EXISTS assembly_expansion_components_quantity_basis_check;

ALTER TABLE public.assembly_expansion_components
  ADD CONSTRAINT assembly_expansion_components_quantity_basis_check
  CHECK (quantity_basis IN (
    'same_as_parent','eave_lf','ridge_lf','perimeter_lf','per_penetration',
    'wall_sf','opening_count','corner_lf','factor','manual'
  ));
