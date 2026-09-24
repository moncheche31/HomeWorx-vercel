-- ============ ENUMS ============
CREATE TYPE public.estimate_status AS ENUM ('draft','in_review','ready','approved');

-- ============ ESTIMATES ============
CREATE TABLE public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  parent_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Estimate',
  notes text,
  status public.estimate_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric NOT NULL DEFAULT 0,
  default_overhead_pct numeric NOT NULL DEFAULT 10,
  default_profit_pct numeric NOT NULL DEFAULT 10,
  default_contingency_pct numeric NOT NULL DEFAULT 0,
  default_labor_rate numeric NOT NULL DEFAULT 65,
  cost_catalog_ref text,
  created_by uuid NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (project_id, version)
);
CREATE INDEX estimates_project_idx ON public.estimates(project_id, version DESC);
CREATE INDEX estimates_org_idx ON public.estimates(organization_id);

GRANT SELECT, INSERT, UPDATE ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_select" ON public.estimates FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "estimates_insert" ON public.estimates FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "estimates_update" ON public.estimates FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER estimates_set_updated_at BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ESTIMATE LINE ITEMS ============
CREATE TABLE public.estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  scope_item_id uuid REFERENCES public.scope_items(id) ON DELETE SET NULL,
  scope_section_id uuid REFERENCES public.scope_sections(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE SET NULL,
  group_label text,
  description text NOT NULL DEFAULT '',
  category_key text,
  subcategory_key text,
  trade_key text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_key public.scope_unit,
  labor_hours numeric NOT NULL DEFAULT 0,
  labor_rate numeric NOT NULL DEFAULT 0,
  material_cost numeric NOT NULL DEFAULT 0,
  equipment_cost numeric NOT NULL DEFAULT 0,
  subcontractor_cost numeric NOT NULL DEFAULT 0,
  other_cost numeric NOT NULL DEFAULT 0,
  overhead_pct numeric NOT NULL DEFAULT 0,
  profit_pct numeric NOT NULL DEFAULT 0,
  contingency_pct numeric NOT NULL DEFAULT 0,
  is_taxable boolean NOT NULL DEFAULT true,
  is_client_visible boolean NOT NULL DEFAULT true,
  internal_notes text,
  catalog_item_key text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  labor_total numeric GENERATED ALWAYS AS (round(labor_hours * labor_rate, 2)) STORED,
  material_total numeric GENERATED ALWAYS AS (round(material_cost * quantity, 2)) STORED,
  equipment_total numeric GENERATED ALWAYS AS (round(equipment_cost * quantity, 2)) STORED,
  subcontractor_total numeric GENERATED ALWAYS AS (round(subcontractor_cost * quantity, 2)) STORED,
  other_total numeric GENERATED ALWAYS AS (round(other_cost * quantity, 2)) STORED,
  direct_cost numeric GENERATED ALWAYS AS (
    round(labor_hours * labor_rate, 2)
    + round(material_cost * quantity, 2)
    + round(equipment_cost * quantity, 2)
    + round(subcontractor_cost * quantity, 2)
    + round(other_cost * quantity, 2)
  ) STORED
);
CREATE INDEX eli_estimate_idx ON public.estimate_line_items(estimate_id, sort_order);
CREATE INDEX eli_org_idx ON public.estimate_line_items(organization_id);
CREATE INDEX eli_scope_item_idx ON public.estimate_line_items(scope_item_id);

GRANT SELECT, INSERT, UPDATE ON public.estimate_line_items TO authenticated;
GRANT ALL ON public.estimate_line_items TO service_role;
ALTER TABLE public.estimate_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eli_select" ON public.estimate_line_items FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "eli_insert" ON public.estimate_line_items FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY "eli_update" ON public.estimate_line_items FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER eli_set_updated_at BEFORE UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- consistency guard: line item must belong to its estimate's org/project
CREATE OR REPLACE FUNCTION public.validate_estimate_line_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e RECORD;
BEGIN
  SELECT organization_id, project_id INTO e FROM public.estimates WHERE id = NEW.estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found' USING ERRCODE='42501'; END IF;
  NEW.organization_id := e.organization_id;
  NEW.project_id := e.project_id;
  RETURN NEW;
END $$;

CREATE TRIGGER eli_validate BEFORE INSERT OR UPDATE ON public.estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_estimate_line_item();

-- ============ AUDIT HISTORY ============
CREATE TABLE public.estimate_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  actor_user_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT 'estimate',
  entity_id uuid,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eae_estimate_idx ON public.estimate_audit_events(estimate_id, created_at DESC);

GRANT SELECT, INSERT ON public.estimate_audit_events TO authenticated;
GRANT ALL ON public.estimate_audit_events TO service_role;
ALTER TABLE public.estimate_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eae_select" ON public.estimate_audit_events FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "eae_insert" ON public.estimate_audit_events FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

-- ============ RPCS ============
CREATE OR REPLACE FUNCTION public.create_estimate_from_scope(_project_id uuid, _title text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid := public.assert_project_in_active_org(_project_id);
  v_version int;
  v_estimate uuid;
  v_tax numeric;
  v_currency text;
  v_count int := 0;
BEGIN
  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = _project_id;
  SELECT COALESCE(tax_rate,0), COALESCE(currency,'USD') INTO v_tax, v_currency
    FROM public.organizations WHERE id = v_org;

  INSERT INTO public.estimates (organization_id, project_id, version, title, status,
    currency, tax_rate, created_by)
  VALUES (v_org, _project_id, v_version,
    COALESCE(NULLIF(btrim(_title),''), 'Estimate v' || v_version), 'draft',
    v_currency, COALESCE(v_tax,0), auth.uid())
  RETURNING id INTO v_estimate;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description,
    category_key, subcategory_key, trade_key, quantity, unit_key,
    is_client_visible, internal_notes, sort_order, created_by,
    overhead_pct, profit_pct, contingency_pct)
  SELECT v_org, _project_id, v_estimate, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity, 1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(), 10, 10, 0
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = _project_id AND si.organization_id = v_org
    AND si.archived_at IS NULL AND si.is_included = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_org, _project_id, v_estimate, auth.uid(), 'created', 'estimate', v_estimate,
    'Estimate generated from scope', jsonb_build_object('lines', v_count, 'version', v_version));

  RETURN v_estimate;
END $$;

CREATE OR REPLACE FUNCTION public.create_estimate_version(_estimate_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.estimates%ROWTYPE;
  v_new uuid;
  v_version int;
BEGIN
  SELECT * INTO v_src FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_src.project_id);

  SELECT COALESCE(MAX(version),0)+1 INTO v_version FROM public.estimates WHERE project_id = v_src.project_id;

  INSERT INTO public.estimates (organization_id, project_id, version, parent_estimate_id,
    title, notes, status, currency, tax_rate, default_overhead_pct, default_profit_pct,
    default_contingency_pct, default_labor_rate, cost_catalog_ref, created_by)
  VALUES (v_src.organization_id, v_src.project_id, v_version, v_src.id,
    'Estimate v' || v_version, v_src.notes, 'draft', v_src.currency, v_src.tax_rate,
    v_src.default_overhead_pct, v_src.default_profit_pct, v_src.default_contingency_pct,
    v_src.default_labor_rate, v_src.cost_catalog_ref, auth.uid())
  RETURNING id INTO v_new;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description, category_key,
    subcategory_key, trade_key, quantity, unit_key, labor_hours, labor_rate, material_cost,
    equipment_cost, subcontractor_cost, other_cost, overhead_pct, profit_pct, contingency_pct,
    is_taxable, is_client_visible, internal_notes, catalog_item_key, sort_order, created_by)
  SELECT organization_id, project_id, v_new, scope_item_id, scope_section_id, room_id,
    group_label, description, category_key, subcategory_key, trade_key, quantity, unit_key,
    labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost,
    overhead_pct, profit_pct, contingency_pct, is_taxable, is_client_visible, internal_notes,
    catalog_item_key, sort_order, auth.uid()
  FROM public.estimate_line_items
  WHERE estimate_id = _estimate_id AND archived_at IS NULL;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_src.organization_id, v_src.project_id, v_new, auth.uid(), 'version_created',
    'estimate', v_new, 'New estimate version created',
    jsonb_build_object('from_estimate', _estimate_id, 'version', v_version));

  RETURN v_new;
END $$;

CREATE OR REPLACE FUNCTION public.sync_estimate_from_scope(_estimate_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.estimates%ROWTYPE; v_count int := 0;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);
  IF v_e.status = 'approved' THEN RAISE EXCEPTION 'estimate_locked'; END IF;

  INSERT INTO public.estimate_line_items (organization_id, project_id, estimate_id,
    scope_item_id, scope_section_id, room_id, group_label, description, category_key,
    subcategory_key, trade_key, quantity, unit_key, is_client_visible, internal_notes,
    sort_order, created_by, overhead_pct, profit_pct, contingency_pct)
  SELECT v_e.organization_id, v_e.project_id, _estimate_id, si.id, si.section_id, si.room_id,
    ss.name, si.title, si.category_key, si.subcategory_key, si.trade_key,
    COALESCE(si.quantity,1), si.unit_key, si.is_client_visible, si.internal_notes,
    (ss.sort_order * 1000) + si.sort_order, auth.uid(),
    v_e.default_overhead_pct, v_e.default_profit_pct, v_e.default_contingency_pct
  FROM public.scope_items si
  JOIN public.scope_sections ss ON ss.id = si.section_id
  WHERE si.project_id = v_e.project_id AND si.organization_id = v_e.organization_id
    AND si.archived_at IS NULL AND si.is_included = true
    AND NOT EXISTS (
      SELECT 1 FROM public.estimate_line_items li
      WHERE li.estimate_id = _estimate_id AND li.scope_item_id = si.id
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
      actor_user_id, event_type, entity_type, entity_id, summary, metadata)
    VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'synced',
      'estimate', _estimate_id, 'Imported new scope items',
      jsonb_build_object('lines', v_count));
  END IF;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.set_estimate_status(_estimate_id uuid, _status public.estimate_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.estimates%ROWTYPE;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  PERFORM public.assert_project_in_active_org(v_e.project_id);

  UPDATE public.estimates
     SET status = _status,
         approved_by = CASE WHEN _status = 'approved' THEN auth.uid() ELSE approved_by END,
         approved_at = CASE WHEN _status = 'approved' THEN now() ELSE approved_at END,
         updated_at = now()
   WHERE id = _estimate_id;

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_e.organization_id, v_e.project_id, _estimate_id, auth.uid(), 'status_changed',
    'estimate', _estimate_id, 'Status changed',
    jsonb_build_object('from', v_e.status, 'to', _status));
END $$;
