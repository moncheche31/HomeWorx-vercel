CREATE OR REPLACE FUNCTION public.apply_org_pricing_method_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_method text;
  org_target numeric;
  org_oh numeric;
  org_profit numeric;
BEGIN
  SELECT default_pricing_method, default_target_gross_margin_pct,
         default_overhead_pct, default_profit_pct
    INTO org_method, org_target, org_oh, org_profit
    FROM public.organizations WHERE id = NEW.organization_id;

  IF org_method IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fill in what the caller did not explicitly choose.
  IF NEW.pricing_method IS NULL OR NEW.pricing_method = 'overhead_profit' THEN
    IF NEW.target_gross_margin_pct IS NULL OR NEW.target_gross_margin_pct = 0 THEN
      NEW.pricing_method := org_method;
      NEW.target_gross_margin_pct := COALESCE(org_target, 0);
      IF COALESCE(NEW.default_overhead_pct, 0) = 0 THEN
        NEW.default_overhead_pct := COALESCE(org_oh, 0);
      END IF;
      IF COALESCE(NEW.default_profit_pct, 0) = 0 THEN
        NEW.default_profit_pct := COALESCE(org_profit, 0);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_apply_org_pricing_defaults ON public.estimates;
CREATE TRIGGER estimates_apply_org_pricing_defaults
BEFORE INSERT ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.apply_org_pricing_method_defaults();
