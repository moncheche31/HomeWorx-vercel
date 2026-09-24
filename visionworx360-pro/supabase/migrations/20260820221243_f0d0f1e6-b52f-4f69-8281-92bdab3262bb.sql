CREATE OR REPLACE FUNCTION public.template_matches_project(_project_type text, _template_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT _project_type IS NULL
      OR _template_type IS NULL
      OR lower(btrim(_project_type)) = lower(btrim(_template_type));
$$;
