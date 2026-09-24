ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS quantity_is_assumed_default boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.flag_estimate_line_assumed_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.quantity_is_assumed_default :=
    COALESCE(NEW.resolution_status::text, 'resolved') = 'resolved'
    AND COALESCE(NEW.is_quantity_placeholder, false)
    AND COALESCE(NEW.quantity, 0) <= 1
    AND NEW.quantity_reviewed_at IS NULL
    AND COALESCE(NEW.quantity_basis, '') NOT IN ('contractor_entered', 'measurement', 'geometry_derived')
    AND NOT COALESCE(NEW.is_price_overridden, false)
    AND COALESCE(NEW.pricing_source::text, '') NOT IN ('contractor', 'manual');
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS zzz_quantity_assumed_default ON public.estimate_line_items;
CREATE TRIGGER zzz_quantity_assumed_default
  BEFORE INSERT OR UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.flag_estimate_line_assumed_default();

ALTER TABLE public.estimate_line_items DISABLE TRIGGER USER;

UPDATE public.estimate_line_items
SET quantity_is_assumed_default =
  COALESCE(resolution_status::text, 'resolved') = 'resolved'
  AND COALESCE(is_quantity_placeholder, false)
  AND COALESCE(quantity, 0) <= 1
  AND quantity_reviewed_at IS NULL
  AND COALESCE(quantity_basis, '') NOT IN ('contractor_entered', 'measurement', 'geometry_derived')
  AND NOT COALESCE(is_price_overridden, false)
  AND COALESCE(pricing_source::text, '') NOT IN ('contractor', 'manual');

ALTER TABLE public.estimate_line_items ENABLE TRIGGER USER;
