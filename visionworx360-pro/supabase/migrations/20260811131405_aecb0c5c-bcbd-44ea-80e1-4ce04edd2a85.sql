DO $$
DECLARE
  v_e public.estimates%ROWTYPE;
  v_res jsonb;
  v_pricing jsonb := '{"defaultLaborRate":66.3,"laborRates":{"demolition":53.04,"framing":67.32,"drywall":63.24,"painting":59.16,"flooring":63.24,"trim":66.3,"doors":66.3,"windows":66.3,"cabinetry":66.3,"countertops":66.3,"roofing":71.4,"siding":66.3,"gutters":66.3,"decks":66.3,"masonry":76.5,"concrete":73.44,"plumbing":89.76,"electrical":93.84,"hvac":89.76,"insulation":66.3,"specialty":66.3,"handyman":66.3},"materialFactor":1.01,"equipmentFactor":1.007,"regionalFactor":1.02,"provenance":{"providerId":"seeded-v1","scope":"state","datasetVersion":"seed-v1","effectiveDate":null,"isSampleData":true,"attribution":null,"currency":"USD"}}'::jsonb;
BEGIN
  SELECT * INTO v_e FROM public.estimates WHERE id = '1d815f3b-6241-40d7-b695-6c8374458dc8';
  IF NOT FOUND THEN RAISE EXCEPTION 'Estimate not found'; END IF;
  IF v_e.locked_at IS NOT NULL
     OR v_e.superseded_by_id IS NOT NULL
     OR v_e.status IN ('approved','sent','accepted','declined','superseded')
  THEN
    RAISE EXCEPTION 'estimate_locked';
  END IF;

  v_res := public.kb_apply_pricing(v_e.id, v_pricing, false);

  INSERT INTO public.estimate_audit_events (organization_id, project_id, estimate_id,
    actor_user_id, event_type, entity_type, entity_id, summary, metadata)
  VALUES (v_e.organization_id, v_e.project_id, v_e.id, NULL, 'repriced',
    'estimate', v_e.id, 'Applied Knowledge Base pricing (coverage pass)', v_res);

  RAISE NOTICE 'reprice result: %', v_res;
END $$;
