-- =========================================================
-- Module 007B — Contractor Knowledge Base (schema)
-- =========================================================

CREATE TABLE public.catalog_library_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  name text NOT NULL,
  notes text,
  is_current boolean NOT NULL DEFAULT false,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.catalog_library_versions TO authenticated;
GRANT ALL ON public.catalog_library_versions TO service_role;
ALTER TABLE public.catalog_library_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library versions readable" ON public.catalog_library_versions
  FOR SELECT TO authenticated USING (true);

-- Master seeded assemblies (never edited by contractors)
CREATE TABLE public.catalog_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_version integer NOT NULL REFERENCES public.catalog_library_versions(version),
  assembly_key text NOT NULL,
  trade_key text NOT NULL,
  category_key text NOT NULL,
  subcategory_key text,
  work_item text NOT NULL,
  default_scope_description text NOT NULL,
  client_description text,
  unit_key public.scope_unit NOT NULL,
  measurement_method text,
  production_rate numeric,
  default_labor_hours numeric,
  crew_size numeric,
  skill_level text,
  material_allowance numeric,
  waste_factor numeric,
  equipment_requirements text,
  suggested_markup_pct numeric,
  default_overhead_pct numeric,
  suggested_profit_pct numeric,
  estimated_duration_hours numeric,
  typical_dependencies text[] NOT NULL DEFAULT '{}',
  internal_notes text,
  safety_notes text,
  code_reference text,
  inspection_notes text,
  keywords text[] NOT NULL DEFAULT '{}',
  synonyms text[] NOT NULL DEFAULT '{}',
  is_sample_data boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(work_item,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(trade_key,'') || ' ' || coalesce(category_key,'') || ' ' || coalesce(subcategory_key,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(default_scope_description,'') || ' ' || coalesce(client_description,'')), 'C')
  ) STORED,
  UNIQUE (library_version, assembly_key)
);
CREATE INDEX catalog_assemblies_search_idx ON public.catalog_assemblies USING gin (search_vector);
CREATE INDEX catalog_assemblies_keywords_idx ON public.catalog_assemblies USING gin (keywords);
CREATE INDEX catalog_assemblies_synonyms_idx ON public.catalog_assemblies USING gin (synonyms);
CREATE INDEX catalog_assemblies_trade_idx ON public.catalog_assemblies (trade_key, category_key);
GRANT SELECT ON public.catalog_assemblies TO authenticated;
GRANT ALL ON public.catalog_assemblies TO service_role;
ALTER TABLE public.catalog_assemblies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "library assemblies readable" ON public.catalog_assemblies
  FOR SELECT TO authenticated USING (true);

-- Contractor overrides on master assemblies (copy-on-write; master untouched)
CREATE TABLE public.org_assembly_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_version integer NOT NULL,
  assembly_key text NOT NULL,
  work_item text,
  default_scope_description text,
  client_description text,
  unit_key public.scope_unit,
  measurement_method text,
  production_rate numeric,
  default_labor_hours numeric,
  crew_size numeric,
  skill_level text,
  material_allowance numeric,
  waste_factor numeric,
  equipment_requirements text,
  suggested_markup_pct numeric,
  default_overhead_pct numeric,
  suggested_profit_pct numeric,
  estimated_duration_hours numeric,
  typical_dependencies text[],
  internal_notes text,
  safety_notes text,
  code_reference text,
  inspection_notes text,
  keywords text[],
  is_disabled boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, assembly_key)
);
CREATE INDEX org_assembly_overrides_org_idx ON public.org_assembly_overrides (organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_assembly_overrides TO authenticated;
GRANT ALL ON public.org_assembly_overrides TO service_role;
ALTER TABLE public.org_assembly_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org overrides readable" ON public.org_assembly_overrides
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org overrides insertable" ON public.org_assembly_overrides
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org overrides updatable" ON public.org_assembly_overrides
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Contractor-owned custom / duplicated assemblies
CREATE TABLE public.org_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_assembly_key text,
  source_library_version integer,
  assembly_key text NOT NULL,
  trade_key text NOT NULL,
  category_key text NOT NULL,
  subcategory_key text,
  work_item text NOT NULL,
  default_scope_description text NOT NULL,
  client_description text,
  unit_key public.scope_unit NOT NULL,
  measurement_method text,
  production_rate numeric,
  default_labor_hours numeric,
  crew_size numeric,
  skill_level text,
  material_allowance numeric,
  waste_factor numeric,
  equipment_requirements text,
  suggested_markup_pct numeric,
  default_overhead_pct numeric,
  suggested_profit_pct numeric,
  estimated_duration_hours numeric,
  typical_dependencies text[] NOT NULL DEFAULT '{}',
  internal_notes text,
  safety_notes text,
  code_reference text,
  inspection_notes text,
  keywords text[] NOT NULL DEFAULT '{}',
  synonyms text[] NOT NULL DEFAULT '{}',
  is_disabled boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, assembly_key)
);
CREATE INDEX org_assemblies_org_idx ON public.org_assemblies (organization_id, trade_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_assemblies TO authenticated;
GRANT ALL ON public.org_assemblies TO service_role;
ALTER TABLE public.org_assemblies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org assemblies readable" ON public.org_assemblies
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "org assemblies insertable" ON public.org_assemblies
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org assemblies updatable" ON public.org_assemblies
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- Favorites / pins
CREATE TABLE public.assembly_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  assembly_key text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, assembly_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_favorites TO authenticated;
GRANT ALL ON public.assembly_favorites TO service_role;
ALTER TABLE public.assembly_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "favorites readable" ON public.assembly_favorites
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) AND user_id = auth.uid());
CREATE POLICY "favorites insertable" ON public.assembly_favorites
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());
CREATE POLICY "favorites updatable" ON public.assembly_favorites
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "favorites deletable" ON public.assembly_favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Usage stats (MRU / MFU)
CREATE TABLE public.assembly_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  assembly_key text NOT NULL,
  use_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, assembly_key)
);
CREATE INDEX assembly_usage_recent_idx ON public.assembly_usage (organization_id, user_id, last_used_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_usage TO authenticated;
GRANT ALL ON public.assembly_usage TO service_role;
ALTER TABLE public.assembly_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usage readable" ON public.assembly_usage
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id) AND user_id = auth.uid());
CREATE POLICY "usage insertable" ON public.assembly_usage
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());
CREATE POLICY "usage updatable" ON public.assembly_usage
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Assembly templates (library-provided and org-created)
CREATE TABLE public.assembly_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  library_version integer,
  template_key text NOT NULL,
  name text NOT NULL,
  description text,
  category_key text,
  trade_key text,
  is_system_template boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assembly_templates_system_key_idx
  ON public.assembly_templates (template_key, library_version) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX assembly_templates_org_key_idx
  ON public.assembly_templates (organization_id, template_key) WHERE organization_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_templates TO authenticated;
GRANT ALL ON public.assembly_templates TO service_role;
ALTER TABLE public.assembly_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates readable" ON public.assembly_templates
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
CREATE POLICY "org templates insertable" ON public.assembly_templates
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));
CREATE POLICY "org templates updatable" ON public.assembly_templates
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE TABLE public.assembly_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.assembly_templates(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  section_label text NOT NULL DEFAULT 'General',
  assembly_key text NOT NULL,
  quantity numeric,
  unit_key public.scope_unit,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assembly_template_items_tpl_idx ON public.assembly_template_items (template_id, sort_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_template_items TO authenticated;
GRANT ALL ON public.assembly_template_items TO service_role;
ALTER TABLE public.assembly_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "template items readable" ON public.assembly_template_items
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));
CREATE POLICY "org template items insertable" ON public.assembly_template_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));
CREATE POLICY "org template items updatable" ON public.assembly_template_items
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));
CREATE POLICY "org template items deletable" ON public.assembly_template_items
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- updated_at triggers
CREATE TRIGGER set_catalog_library_versions_updated BEFORE UPDATE ON public.catalog_library_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_catalog_assemblies_updated BEFORE UPDATE ON public.catalog_assemblies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_org_assembly_overrides_updated BEFORE UPDATE ON public.org_assembly_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_org_assemblies_updated BEFORE UPDATE ON public.org_assemblies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_assembly_templates_updated BEFORE UPDATE ON public.assembly_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Library v1 registration
INSERT INTO public.catalog_library_versions (version, name, notes, is_current)
VALUES (1, 'VisionWorx360 Contractor Library v1',
  'Initial seeded residential remodeling knowledge base. Structurally valid sample assumptions; not licensed cost data.', true);

-- =========================================================
-- Effective (merged) assembly resolution + search
-- =========================================================
CREATE OR REPLACE FUNCTION public.search_assemblies(
  _search text DEFAULT NULL,
  _trade text DEFAULT NULL,
  _category text DEFAULT NULL,
  _include_disabled boolean DEFAULT false,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  assembly_key text,
  origin text,
  trade_key text,
  category_key text,
  subcategory_key text,
  work_item text,
  default_scope_description text,
  client_description text,
  unit_key public.scope_unit,
  measurement_method text,
  production_rate numeric,
  default_labor_hours numeric,
  crew_size numeric,
  skill_level text,
  material_allowance numeric,
  waste_factor numeric,
  equipment_requirements text,
  suggested_markup_pct numeric,
  default_overhead_pct numeric,
  suggested_profit_pct numeric,
  estimated_duration_hours numeric,
  typical_dependencies text[],
  internal_notes text,
  safety_notes text,
  code_reference text,
  inspection_notes text,
  keywords text[],
  is_customized boolean,
  is_disabled boolean,
  is_archived boolean,
  is_favorite boolean,
  is_pinned boolean,
  use_count integer,
  last_used_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_active_organization_id();
  v_uid uuid := auth.uid();
  v_version integer;
  v_q tsquery;
  v_term text;
BEGIN
  SELECT version INTO v_version FROM public.catalog_library_versions WHERE is_current LIMIT 1;
  IF _search IS NOT NULL AND btrim(_search) <> '' THEN
    v_q := websearch_to_tsquery('simple', btrim(_search));
    v_term := '%' || btrim(_search) || '%';
  END IF;

  RETURN QUERY
  WITH lib AS (
    SELECT a.*, o.id AS override_id, o.is_disabled AS o_disabled, o.archived_at AS o_archived,
           o.work_item AS o_work_item, o.default_scope_description AS o_scope,
           o.client_description AS o_client, o.unit_key AS o_unit,
           o.measurement_method AS o_measure, o.production_rate AS o_prod,
           o.default_labor_hours AS o_hours, o.crew_size AS o_crew, o.skill_level AS o_skill,
           o.material_allowance AS o_material, o.waste_factor AS o_waste,
           o.equipment_requirements AS o_equip, o.suggested_markup_pct AS o_markup,
           o.default_overhead_pct AS o_overhead, o.suggested_profit_pct AS o_profit,
           o.estimated_duration_hours AS o_duration, o.typical_dependencies AS o_deps,
           o.internal_notes AS o_internal, o.safety_notes AS o_safety,
           o.code_reference AS o_code, o.inspection_notes AS o_inspection,
           o.keywords AS o_keywords
    FROM public.catalog_assemblies a
    LEFT JOIN public.org_assembly_overrides o
      ON o.assembly_key = a.assembly_key AND o.organization_id = v_org
    WHERE a.library_version = v_version
      AND a.is_active
      AND (
        v_q IS NULL
        OR a.search_vector @@ v_q
        OR EXISTS (SELECT 1 FROM unnest(a.keywords || a.synonyms) k WHERE k ILIKE v_term)
      )
      AND (_trade IS NULL OR a.trade_key = _trade)
      AND (_category IS NULL OR a.category_key = _category)
  ),
  merged AS (
    SELECT
      l.assembly_key,
      'library'::text AS origin,
      l.trade_key, l.category_key, l.subcategory_key,
      COALESCE(l.o_work_item, l.work_item) AS work_item,
      COALESCE(l.o_scope, l.default_scope_description) AS default_scope_description,
      COALESCE(l.o_client, l.client_description) AS client_description,
      COALESCE(l.o_unit, l.unit_key) AS unit_key,
      COALESCE(l.o_measure, l.measurement_method) AS measurement_method,
      COALESCE(l.o_prod, l.production_rate) AS production_rate,
      COALESCE(l.o_hours, l.default_labor_hours) AS default_labor_hours,
      COALESCE(l.o_crew, l.crew_size) AS crew_size,
      COALESCE(l.o_skill, l.skill_level) AS skill_level,
      COALESCE(l.o_material, l.material_allowance) AS material_allowance,
      COALESCE(l.o_waste, l.waste_factor) AS waste_factor,
      COALESCE(l.o_equip, l.equipment_requirements) AS equipment_requirements,
      COALESCE(l.o_markup, l.suggested_markup_pct) AS suggested_markup_pct,
      COALESCE(l.o_overhead, l.default_overhead_pct) AS default_overhead_pct,
      COALESCE(l.o_profit, l.suggested_profit_pct) AS suggested_profit_pct,
      COALESCE(l.o_duration, l.estimated_duration_hours) AS estimated_duration_hours,
      COALESCE(l.o_deps, l.typical_dependencies) AS typical_dependencies,
      COALESCE(l.o_internal, l.internal_notes) AS internal_notes,
      COALESCE(l.o_safety, l.safety_notes) AS safety_notes,
      COALESCE(l.o_code, l.code_reference) AS code_reference,
      COALESCE(l.o_inspection, l.inspection_notes) AS inspection_notes,
      COALESCE(l.o_keywords, l.keywords) AS keywords,
      (l.override_id IS NOT NULL) AS is_customized,
      COALESCE(l.o_disabled, false) AS is_disabled,
      (l.o_archived IS NOT NULL) AS is_archived,
      l.sort_order
    FROM lib l
    UNION ALL
    SELECT
      c.assembly_key, 'organization'::text,
      c.trade_key, c.category_key, c.subcategory_key, c.work_item,
      c.default_scope_description, c.client_description, c.unit_key, c.measurement_method,
      c.production_rate, c.default_labor_hours, c.crew_size, c.skill_level,
      c.material_allowance, c.waste_factor, c.equipment_requirements,
      c.suggested_markup_pct, c.default_overhead_pct, c.suggested_profit_pct,
      c.estimated_duration_hours, c.typical_dependencies, c.internal_notes,
      c.safety_notes, c.code_reference, c.inspection_notes, c.keywords,
      true, c.is_disabled, (c.archived_at IS NOT NULL), 0
    FROM public.org_assemblies c
    WHERE c.organization_id = v_org
      AND (_trade IS NULL OR c.trade_key = _trade)
      AND (_category IS NULL OR c.category_key = _category)
      AND (
        v_q IS NULL OR
        to_tsvector('simple',
          coalesce(c.work_item,'') || ' ' || coalesce(c.default_scope_description,'')
        ) @@ v_q
        OR EXISTS (SELECT 1 FROM unnest(c.keywords || c.synonyms) k WHERE k ILIKE v_term)
      )
  )
  SELECT m.assembly_key, m.origin, m.trade_key, m.category_key, m.subcategory_key, m.work_item,
         m.default_scope_description, m.client_description, m.unit_key, m.measurement_method,
         m.production_rate, m.default_labor_hours, m.crew_size, m.skill_level,
         m.material_allowance, m.waste_factor, m.equipment_requirements,
         m.suggested_markup_pct, m.default_overhead_pct, m.suggested_profit_pct,
         m.estimated_duration_hours, m.typical_dependencies, m.internal_notes,
         m.safety_notes, m.code_reference, m.inspection_notes, m.keywords,
         m.is_customized, m.is_disabled, m.is_archived,
         (f.id IS NOT NULL) AS is_favorite,
         COALESCE(f.is_pinned, false) AS is_pinned,
         COALESCE(u.use_count, 0) AS use_count,
         u.last_used_at
  FROM merged m
  LEFT JOIN public.assembly_favorites f
    ON f.assembly_key = m.assembly_key AND f.organization_id = v_org AND f.user_id = v_uid
  LEFT JOIN public.assembly_usage u
    ON u.assembly_key = m.assembly_key AND u.organization_id = v_org AND u.user_id = v_uid
  WHERE (_include_disabled OR (NOT m.is_disabled AND NOT m.is_archived))
  ORDER BY COALESCE(f.is_pinned, false) DESC, m.trade_key, m.category_key, m.sort_order, m.work_item
  LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0);
END;
$$;

-- Duplicate a library or org assembly into an editable org-owned copy
CREATE OR REPLACE FUNCTION public.duplicate_assembly(_assembly_key text, _new_key text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_active_organization_id();
  v_version integer;
  v_key text;
  v_new uuid;
BEGIN
  SELECT version INTO v_version FROM public.catalog_library_versions WHERE is_current LIMIT 1;
  v_key := COALESCE(NULLIF(btrim(_new_key), ''), _assembly_key || '.copy.' || substr(gen_random_uuid()::text, 1, 8));

  INSERT INTO public.org_assemblies (
    organization_id, source_assembly_key, source_library_version, assembly_key,
    trade_key, category_key, subcategory_key, work_item, default_scope_description,
    client_description, unit_key, measurement_method, production_rate, default_labor_hours,
    crew_size, skill_level, material_allowance, waste_factor, equipment_requirements,
    suggested_markup_pct, default_overhead_pct, suggested_profit_pct, estimated_duration_hours,
    typical_dependencies, internal_notes, safety_notes, code_reference, inspection_notes,
    keywords, synonyms, created_by)
  SELECT v_org, a.assembly_key, v_version, v_key,
    a.trade_key, a.category_key, a.subcategory_key, a.work_item || ' (copy)', a.default_scope_description,
    a.client_description, a.unit_key, a.measurement_method, a.production_rate, a.default_labor_hours,
    a.crew_size, a.skill_level, a.material_allowance, a.waste_factor, a.equipment_requirements,
    a.suggested_markup_pct, a.default_overhead_pct, a.suggested_profit_pct, a.estimated_duration_hours,
    a.typical_dependencies, a.internal_notes, a.safety_notes, a.code_reference, a.inspection_notes,
    a.keywords, a.synonyms, auth.uid()
  FROM public.catalog_assemblies a
  WHERE a.assembly_key = _assembly_key AND a.library_version = v_version
  RETURNING id INTO v_new;

  IF v_new IS NULL THEN
    INSERT INTO public.org_assemblies (
      organization_id, source_assembly_key, source_library_version, assembly_key,
      trade_key, category_key, subcategory_key, work_item, default_scope_description,
      client_description, unit_key, measurement_method, production_rate, default_labor_hours,
      crew_size, skill_level, material_allowance, waste_factor, equipment_requirements,
      suggested_markup_pct, default_overhead_pct, suggested_profit_pct, estimated_duration_hours,
      typical_dependencies, internal_notes, safety_notes, code_reference, inspection_notes,
      keywords, synonyms, created_by)
    SELECT v_org, c.assembly_key, c.source_library_version, v_key,
      c.trade_key, c.category_key, c.subcategory_key, c.work_item || ' (copy)', c.default_scope_description,
      c.client_description, c.unit_key, c.measurement_method, c.production_rate, c.default_labor_hours,
      c.crew_size, c.skill_level, c.material_allowance, c.waste_factor, c.equipment_requirements,
      c.suggested_markup_pct, c.default_overhead_pct, c.suggested_profit_pct, c.estimated_duration_hours,
      c.typical_dependencies, c.internal_notes, c.safety_notes, c.code_reference, c.inspection_notes,
      c.keywords, c.synonyms, auth.uid()
    FROM public.org_assemblies c
    WHERE c.assembly_key = _assembly_key AND c.organization_id = v_org
    RETURNING id INTO v_new;
  END IF;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'Assembly not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_new;
END;
$$;

-- Record usage (MRU/MFU)
CREATE OR REPLACE FUNCTION public.record_assembly_usage(_assembly_keys text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_active_organization_id();
  v_key text;
BEGIN
  FOREACH v_key IN ARRAY _assembly_keys LOOP
    INSERT INTO public.assembly_usage (organization_id, user_id, assembly_key, use_count, last_used_at)
    VALUES (v_org, auth.uid(), v_key, 1, now())
    ON CONFLICT (organization_id, user_id, assembly_key)
    DO UPDATE SET use_count = public.assembly_usage.use_count + 1, last_used_at = now();
  END LOOP;
END;
$$;

-- Apply an assembly template into a project's scope (always additive)
CREATE OR REPLACE FUNCTION public.apply_assembly_template(_project_id uuid, _template_id uuid, _room_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_tpl public.assembly_templates%ROWTYPE;
  v_section RECORD;
  v_item RECORD;
  v_section_id uuid;
  v_sort integer;
  v_idx integer;
  v_sections integer := 0;
  v_items integer := 0;
  v_asm RECORD;
BEGIN
  SELECT * INTO v_tpl FROM public.assembly_templates
   WHERE id = _template_id AND is_active
     AND (organization_id IS NULL OR organization_id = v_org);
  IF v_tpl.id IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;

  IF _room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms WHERE id = _room_id AND project_id = _project_id AND organization_id = v_org
  ) THEN RAISE EXCEPTION 'Room not in project'; END IF;

  SELECT COALESCE(MAX(sort_order), -1) INTO v_sort FROM public.scope_sections
   WHERE project_id = _project_id AND organization_id = v_org;

  PERFORM set_config('app.suppress_scope_activity', 'on', true);

  FOR v_section IN
    SELECT section_label, MIN(sort_order) AS ord
    FROM public.assembly_template_items WHERE template_id = _template_id
    GROUP BY section_label ORDER BY MIN(sort_order)
  LOOP
    v_sort := v_sort + 1;
    INSERT INTO public.scope_sections (organization_id, project_id, room_id, name, sort_order, created_by)
    VALUES (v_org, _project_id, _room_id, v_section.section_label, v_sort, auth.uid())
    RETURNING id INTO v_section_id;
    v_sections := v_sections + 1;
    v_idx := 0;

    FOR v_item IN
      SELECT * FROM public.assembly_template_items
       WHERE template_id = _template_id AND section_label = v_section.section_label
       ORDER BY sort_order
    LOOP
      SELECT * INTO v_asm FROM public.search_assemblies(NULL, NULL, NULL, true, 5000, 0) s
       WHERE s.assembly_key = v_item.assembly_key LIMIT 1;

      INSERT INTO public.scope_items (
        organization_id, project_id, section_id, room_id, title, scope_item_key,
        trade_key, category_key, subcategory_key, description, quantity, unit_key,
        sort_order, created_by, is_included, completion_status)
      VALUES (
        v_org, _project_id, v_section_id, _room_id,
        COALESCE(v_asm.work_item, v_item.assembly_key), v_item.assembly_key,
        v_asm.trade_key, v_asm.category_key, v_asm.subcategory_key,
        COALESCE(v_asm.default_scope_description, v_item.notes),
        v_item.quantity, COALESCE(v_item.unit_key, v_asm.unit_key),
        v_idx, auth.uid(), true, 'draft');
      v_idx := v_idx + 1;
      v_items := v_items + 1;
    END LOOP;
  END LOOP;

  PERFORM set_config('app.suppress_scope_activity', 'off', true);

  INSERT INTO public.project_activity (organization_id, project_id, actor_user_id,
    activity_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, auth.uid(), 'applied', 'scope_template', _template_id, v_tpl.name,
    jsonb_build_object('sections_created', v_sections, 'items_created', v_items, 'room_id', _room_id));

  RETURN jsonb_build_object('sections_created', v_sections, 'items_created', v_items);
END;
$$;
