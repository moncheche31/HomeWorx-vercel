CREATE OR REPLACE FUNCTION public.normalize_estimate_line_money()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_money boolean;
  v_no_charge boolean := COALESCE(NEW.pricing_provenance->>'noCharge','') = 'true';
BEGIN
  /*
   * Unit rates keep cents; authoritative money (labor_total, material_total,
   * ..., direct_cost) is already rounded to whole dollars by the generated
   * columns. Rounding the per-unit rate distorted low $/SF material rates.
   */
  NEW.material_cost      := round(COALESCE(NEW.material_cost, 0), 2);
  NEW.equipment_cost     := round(COALESCE(NEW.equipment_cost, 0), 2);
  NEW.subcontractor_cost := round(COALESCE(NEW.subcontractor_cost, 0), 2);
  NEW.other_cost         := round(COALESCE(NEW.other_cost, 0), 2);

  v_has_money := (COALESCE(NEW.labor_hours,0) > 0 AND COALESCE(NEW.labor_rate,0) > 0)
                 OR COALESCE(NEW.material_cost,0) > 0
                 OR COALESCE(NEW.equipment_cost,0) > 0
                 OR COALESCE(NEW.subcontractor_cost,0) > 0
                 OR COALESCE(NEW.other_cost,0) > 0;

  /* An "override" with no dollars and no hours is not a contractor price. */
  IF COALESCE(NEW.is_price_overridden,false) AND NOT v_has_money AND NOT v_no_charge THEN
    NEW.is_price_overridden := false;
    IF NEW.pricing_provenance IS NOT NULL THEN
      NEW.pricing_provenance := NEW.pricing_provenance
        || jsonb_build_object('phantomOverrideCleared', true);
    END IF;
  END IF;

  RETURN NEW;
END
$function$;
