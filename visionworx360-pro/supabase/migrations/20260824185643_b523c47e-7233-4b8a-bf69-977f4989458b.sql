CREATE OR REPLACE FUNCTION public.flag_estimate_line_assumed_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_basis text := COALESCE(NEW.quantity_basis, '');
  v_evidence_backed boolean;
  v_contractor_authority boolean;
BEGIN
  v_evidence_backed := v_basis IN ('contractor_entered', 'measurement', 'geometry_derived');

  v_contractor_authority :=
    NEW.quantity_reviewed_at IS NOT NULL
    OR COALESCE(NEW.is_price_overridden, false)
    OR COALESCE(NEW.pricing_source::text, '') IN ('contractor', 'manual');

  NEW.quantity_is_assumed_default :=
    COALESCE(NEW.resolution_status::text, 'resolved') = 'resolved'
    AND NOT v_evidence_backed
    AND NOT v_contractor_authority
    AND (
      v_basis IN ('allowance', 'ballpark_allowance')
      OR (COALESCE(NEW.is_quantity_placeholder, false) AND COALESCE(NEW.quantity, 0) <= 1)
    );
  RETURN NEW;
END
$$;

ALTER TABLE public.estimate_line_items DISABLE TRIGGER USER;

UPDATE public.estimate_line_items
SET quantity_is_assumed_default = (
  COALESCE(resolution_status::text, 'resolved') = 'resolved'
  AND COALESCE(quantity_basis, '') NOT IN ('contractor_entered', 'measurement', 'geometry_derived')
  AND quantity_reviewed_at IS NULL
  AND NOT COALESCE(is_price_overridden, false)
  AND COALESCE(pricing_source::text, '') NOT IN ('contractor', 'manual')
  AND (
    COALESCE(quantity_basis, '') IN ('allowance', 'ballpark_allowance')
    OR (COALESCE(is_quantity_placeholder, false) AND COALESCE(quantity, 0) <= 1)
  )
)
WHERE archived_at IS NULL;

ALTER TABLE public.estimate_line_items ENABLE TRIGGER USER;
