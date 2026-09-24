CREATE OR REPLACE FUNCTION public.flag_estimate_line_placeholder_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- A quantity of exactly 1 on a MEASURED unit is a default, not a measurement.
  -- Pricing a 288 sq ft floor as 1 sq ft is the root cause of near-zero totals,
  -- so those lines must be reviewed before they count as complete.
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

  RETURN NEW;
END
$$;

UPDATE public.estimate_line_items
SET is_quantity_placeholder = true
WHERE archived_at IS NULL
  AND quantity_reviewed_at IS NULL
  AND COALESCE(quantity, 1) = 1
  AND unit_key IS NOT NULL
  AND unit_key NOT IN ('each', 'lump_sum', 'allowance', 'other')
  AND is_quantity_placeholder = false;
