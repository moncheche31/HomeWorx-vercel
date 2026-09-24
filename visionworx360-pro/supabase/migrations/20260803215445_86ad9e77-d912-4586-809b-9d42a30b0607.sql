CREATE TABLE public.project_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.project_rooms(id) ON DELETE CASCADE,
  label text,
  length_ft numeric,
  width_ft numeric,
  ceiling_height_ft numeric,
  openings jsonb NOT NULL DEFAULT '[]'::jsonb,
  interior_partition_lf numeric,
  floor_waste_pct numeric NOT NULL DEFAULT 10,
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_measurements TO authenticated;
GRANT ALL ON public.project_measurements TO service_role;

ALTER TABLE public.project_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "measurements_select" ON public.project_measurements
  FOR SELECT TO authenticated
  USING (organization_id = public.current_active_organization_id());

CREATE POLICY "measurements_insert" ON public.project_measurements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_active_organization_id());

CREATE POLICY "measurements_update" ON public.project_measurements
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_active_organization_id())
  WITH CHECK (organization_id = public.current_active_organization_id());

CREATE UNIQUE INDEX project_measurements_project_room_uq
  ON public.project_measurements (project_id, COALESCE(room_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER project_measurements_updated_at
  BEFORE UPDATE ON public.project_measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* --------------------------------------------------------------------------
   Apply geometry-derived quantities to estimate lines.

   _assignments = [
     { "line_id": uuid,
       "quantity": numeric,
       "unit_key": scope_unit,
       "provenance": {...},
       "expansions": [ { "description": text, "quantity": numeric,
                         "unit_key": scope_unit, "provenance": {...} } ] }
   ]

   Contractor authority is absolute: overridden lines and non-editable
   estimates are skipped, never mutated.
-------------------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.apply_geometry_quantities(
  _estimate_id uuid,
  _assignments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := public.current_active_organization_id();
  v_est public.estimates%ROWTYPE;
  v_li public.estimate_line_items%ROWTYPE;
  v_a jsonb;
  v_e jsonb;
  v_qty numeric;
  v_unit public.scope_unit;
  v_updated int := 0;
  v_inserted int := 0;
  v_skipped int := 0;
  v_idx int;
BEGIN
  SELECT * INTO v_est FROM public.estimates WHERE id = _estimate_id;
  IF NOT FOUND OR v_est.organization_id IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'estimate_not_found' USING ERRCODE = '42501';
  END IF;
  IF NOT public.estimate_is_editable(_estimate_id) THEN
    RAISE EXCEPTION 'estimate_locked' USING ERRCODE = '42501';
  END IF;
  IF _assignments IS NULL OR jsonb_typeof(_assignments) <> 'array' THEN
    RAISE EXCEPTION 'assignments_required' USING ERRCODE = '22023';
  END IF;

  FOR v_a IN SELECT * FROM jsonb_array_elements(_assignments) LOOP
    SELECT * INTO v_li FROM public.estimate_line_items
     WHERE id = (v_a->>'line_id')::uuid
       AND estimate_id = _estimate_id
       AND organization_id = v_org;

    IF NOT FOUND OR v_li.archived_at IS NOT NULL OR v_li.is_price_overridden THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_qty := (v_a->>'quantity')::numeric;
    IF v_qty IS NULL OR v_qty < 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_unit := COALESCE(NULLIF(v_a->>'unit_key','')::public.scope_unit, v_li.unit_key);

    UPDATE public.estimate_line_items li SET
      description = COALESCE(NULLIF(btrim(v_a->>'description'), ''), li.description),
      quantity = v_qty,
      unit_key = v_unit,
      is_quantity_placeholder = false,
      quantity_reviewed_by = auth.uid(),
      quantity_reviewed_at = now(),
      pricing_provenance = li.pricing_provenance
        || jsonb_build_object('quantity', COALESCE(v_a->'provenance', '{}'::jsonb))
    WHERE li.id = v_li.id;
    v_updated := v_updated + 1;

    /* Retire previously generated surface siblings so re-applying is safe. */
    UPDATE public.estimate_line_items li
       SET archived_at = now()
     WHERE li.estimate_id = _estimate_id
       AND li.id <> v_li.id
       AND li.archived_at IS NULL
       AND li.is_price_overridden = false
       AND li.pricing_provenance->'geometrySurface'->>'sourceLineId' = v_li.id::text;

    v_idx := 1;
    FOR v_e IN SELECT * FROM jsonb_array_elements(COALESCE(v_a->'expansions', '[]'::jsonb)) LOOP
      INSERT INTO public.estimate_line_items (
        organization_id, project_id, estimate_id, scope_item_id, scope_section_id,
        room_id, group_label, description, category_key, subcategory_key, trade_key,
        quantity, unit_key, labor_rate, overhead_pct, profit_pct, contingency_pct,
        is_taxable, is_client_visible, sort_order, created_by,
        quantity_reviewed_by, quantity_reviewed_at, pricing_provenance
      ) VALUES (
        v_li.organization_id, v_li.project_id, v_li.estimate_id, v_li.scope_item_id,
        v_li.scope_section_id, v_li.room_id, v_li.group_label,
        COALESCE(NULLIF(btrim(v_e->>'description'), ''), v_li.description),
        v_li.category_key, v_li.subcategory_key, v_li.trade_key,
        (v_e->>'quantity')::numeric,
        COALESCE(NULLIF(v_e->>'unit_key','')::public.scope_unit, v_unit),
        v_li.labor_rate, v_li.overhead_pct, v_li.profit_pct, v_li.contingency_pct,
        v_li.is_taxable, v_li.is_client_visible, v_li.sort_order + v_idx,
        COALESCE(auth.uid(), v_li.created_by), auth.uid(), now(),
        jsonb_build_object(
          'quantity', COALESCE(v_e->'provenance', '{}'::jsonb),
          'geometrySurface', jsonb_build_object(
            'sourceLineId', v_li.id,
            'role', COALESCE(v_e->>'role', 'surface'),
            'appliedAt', now()))
      );
      v_inserted := v_inserted + 1;
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;

  INSERT INTO public.estimate_audit_events (
    organization_id, project_id, estimate_id, event_type, entity_type, entity_id,
    summary, metadata)
  VALUES (v_est.organization_id, v_est.project_id, _estimate_id,
    'geometry_quantities_applied', 'estimate', _estimate_id,
    'Quantities derived from project measurements',
    jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'skipped', v_skipped));

  RETURN jsonb_build_object('updated', v_updated, 'inserted', v_inserted, 'skipped', v_skipped);
END $function$;

REVOKE ALL ON FUNCTION public.apply_geometry_quantities(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_geometry_quantities(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_geometry_quantities(uuid, jsonb) TO service_role;
