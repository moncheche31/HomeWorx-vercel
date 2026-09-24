CREATE OR REPLACE FUNCTION public.round_quarter_hour(v numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN v IS NULL THEN NULL
    WHEN v <= 0 THEN 0
    ELSE GREATEST(0.25, round(round(v * 4) / 4, 2))
  END
$$;
