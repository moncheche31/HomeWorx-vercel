
CREATE OR REPLACE FUNCTION public.nce_craft_for_trade(_trade_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(COALESCE(_trade_key, ''))
    WHEN 'roofing' THEN 'Roofer'
    WHEN 'siding' THEN 'Carpenter'
    WHEN 'exterior' THEN 'Carpenter'
    WHEN 'carpentry' THEN 'Carpenter'
    WHEN 'trim' THEN 'Carpenter'
    WHEN 'framing' THEN 'Carpenter'
    WHEN 'decks' THEN 'Carpenter'
    WHEN 'doors' THEN 'Carpenter'
    WHEN 'windows' THEN 'Carpenter'
    WHEN 'doors_windows' THEN 'Carpenter'
    WHEN 'cabinetry' THEN 'Carpenter'
    WHEN 'drywall' THEN 'Drywall installer'
    WHEN 'painting' THEN 'Painter'
    WHEN 'flooring' THEN 'Floor Layer'
    WHEN 'tile' THEN 'Tile Layer'
    WHEN 'electrical' THEN 'Electrician'
    WHEN 'plumbing' THEN 'Plumber'
    WHEN 'hvac' THEN 'Sheet Metal Worker'
    WHEN 'masonry' THEN 'Bricklayer'
    WHEN 'concrete' THEN 'Cement Mason'
    WHEN 'insulation' THEN 'Building Laborer'
    WHEN 'demolition' THEN 'Building Laborer'
    WHEN 'sitework' THEN 'Building Laborer'
    WHEN 'landscaping' THEN 'Building Laborer'
    WHEN 'general_conditions' THEN 'Building Laborer'
    ELSE 'Carpenter'
  END;
$$;

ALTER FUNCTION public.nce_labor_multiplier(text) SECURITY INVOKER;
ALTER FUNCTION public.nce_labor_rate(text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.nce_book_lookup(text, text, numeric) SECURITY INVOKER;
ALTER FUNCTION public.apply_book_labor_rates(uuid) SECURITY INVOKER;
ALTER FUNCTION public.tag_estimate_book_sources(uuid) SECURITY INVOKER;
