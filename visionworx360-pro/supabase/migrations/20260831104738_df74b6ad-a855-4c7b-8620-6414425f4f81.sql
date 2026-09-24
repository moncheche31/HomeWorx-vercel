CREATE OR REPLACE FUNCTION public.flag_estimate_line_placeholder_quantity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- A quantity of exactly 1 on a MEASURED unit is a default, not a measurement.
  IF COALESCE(NEW.quantity, 1) = 1
     AND NEW.quantity_reviewed_at IS NULL
     AND NEW.unit_key IS NOT NULL
     AND NEW.unit_key NOT IN ('each', 'lump_sum', 'allowance', 'other')
  THEN
    NEW.is_quantity_placeholder := true;
  END IF;

  IF NEW.scope_item_id IS NOT NULL
     AND COALESCE(NEW.quantity, 1) = 1
     AND NEW.quantity_reviewed_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.scope_items si
       WHERE si.id = NEW.scope_item_id AND COALESCE(si.quantity, 0) = 0
     )
  THEN
    NEW.is_quantity_placeholder := true;
  END IF;

  -- THE BASIS DECIDES. A quantity that came from a ballpark ratio, a stated
  -- assumption, or no evidence at all is an unconfirmed size no matter how
  -- precise the number looks. Only an explicit contractor review of that
  -- quantity clears the flag.
  IF NEW.quantity_basis IN ('ballpark_allowance', 'assumed', 'assumed_default', 'needs_evidence')
     AND NEW.quantity_reviewed_at IS NULL
  THEN
    NEW.is_quantity_placeholder := true;
  END IF;

  RETURN NEW;
END
$function$;
