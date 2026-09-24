CREATE OR REPLACE FUNCTION public.round_quarter_hour(v numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT CASE WHEN v IS NULL THEN NULL ELSE round(round(v * 4) / 4, 2) END $$;

CREATE OR REPLACE FUNCTION public.normalize_labor_quarter_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_incoming_labor_total numeric := COALESCE(NEW.labor_total, 0);
  v_new_labor_total numeric;
BEGIN
  NEW.labor_hours := public.round_quarter_hour(COALESCE(NEW.labor_hours, 0));
  NEW.labor_hours_setup := public.round_quarter_hour(COALESCE(NEW.labor_hours_setup, 0));

  v_new_labor_total := round(COALESCE(NEW.labor_hours, 0) * COALESCE(NEW.labor_rate, 0), 0);
  NEW.labor_total := v_new_labor_total;
  NEW.direct_cost := COALESCE(NEW.direct_cost, 0) + (v_new_labor_total - v_incoming_labor_total);

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS zz_labor_quarter_hours ON public.estimate_line_items;
CREATE TRIGGER zz_labor_quarter_hours
BEFORE INSERT OR UPDATE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.normalize_labor_quarter_hours();
