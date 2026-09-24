DO $$
DECLARE
  v_project uuid := 'e9701d2f-a510-41ca-9966-bf28617c9217';
  v_org uuid;
  v_owner uuid;
  v_section uuid;
BEGIN
  SELECT organization_id, created_by INTO v_org, v_owner FROM public.projects WHERE id = v_project;
  IF v_org IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.scope_items WHERE project_id = v_project) THEN RETURN; END IF;

  INSERT INTO public.scope_sections (organization_id, project_id, name, section_key, trade_key, sort_order, created_by)
  VALUES (v_org, v_project, 'Kitchen Cabinetry', 'kitchen_cabinetry', 'cabinetry', 0, v_owner)
  RETURNING id INTO v_section;

  INSERT INTO public.scope_items
    (organization_id, project_id, section_id, title, scope_item_key, trade_key, description, quantity, unit_key, sort_order, created_by)
  VALUES
    (v_org, v_project, v_section, 'Base cabinetry', 'cabinets.replace', 'cabinetry',
     'Base cabinet run taken from the stated overall run 7'' 10".', 7.833, 'linear_foot', 0, v_owner),
    (v_org, v_project, v_section, 'Upper cabinetry', 'cabinets.upper', 'cabinetry',
     'Upper cabinets run the full 7'' 10" — the same wall as the base cabinets.', 7.833, 'linear_foot', 1, v_owner),
    (v_org, v_project, v_section, 'Relocate electrical device', 'mechanical.outlet_relocate', 'electrical',
     'Relocate one existing receptacle up to countertop level.', 1, 'each', 2, v_owner);
END $$;
