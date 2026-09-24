CREATE OR REPLACE FUNCTION public.enforce_quantity_evidence_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_contractor boolean := coalesce(NEW.is_price_overridden, false)
                          OR coalesce(NEW.pricing_source, '') IN ('contractor', 'manual');
  v_fee boolean := public.is_fee_basis(NEW.cost_basis);
  v_confirmed boolean := NEW.catalog_confirmed_at IS NOT NULL;
  v_old_key text := NEW.catalog_item_key;
  v_allowed text[] := ARRAY['contractor_entered','measurement','geometry_derived',
                            'scope_stated_count','fee_scope','ballpark_allowance'];
  v_fee_amount numeric := coalesce(NEW.material_cost, 0) + coalesce(NEW.other_cost, 0)
                        + coalesce(NEW.subcontractor_cost, 0) + coalesce(NEW.equipment_cost, 0);
BEGIN
  IF v_old_key IS NOT NULL AND NOT v_confirmed
     AND NOT public.catalog_mapping_is_semantic(NEW.description, v_old_key) THEN
    NEW.catalog_item_key := NULL;
    NEW.pricing_source := 'unmatched';
    NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
      || jsonb_build_object('rejectedCatalogKey', v_old_key,
                            'rejectedReason', 'semantic_mismatch',
                            'rejectedAt', now());
    NEW.labor_hours_per_unit := 0;
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := 'no_catalog_match';
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note :=
      'The catalog item matched to this task did not describe this work. The match was removed - needs review.';
  END IF;

  IF NOT v_fee
     AND public.quantity_is_composite_scope(NEW.description, NEW.unit_key::text, NEW.quantity) THEN
    NEW.resolution_status := 'unresolved';
    NEW.unresolved_reason := coalesce(nullif(NEW.unresolved_reason, ''), 'ambiguous_multi_scope');
    NEW.quantity_basis := 'needs_evidence';
    NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
      'This line bundles several components into one unit. Break it into counted components or price it as a labelled allowance.');
  END IF;

  /*
    A permit or fee is its own evidence: the amount IS the scope. It carries no
    measured quantity and no labour, so the generic evidence gate must not
    empty it out - a permit with a real fee stays priced and resolved.
  */
  IF v_fee AND v_fee_amount > 0 THEN
    NEW.resolution_status := 'resolved';
    NEW.unresolved_reason := NULL;
    NEW.labor_hours := 0;
    NEW.quantity_basis := 'fee_scope';
    NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
      'Fee or permit line: the fee amount is the scope, no measured quantity.');
    RETURN NEW;
  END IF;

  IF NEW.resolution_status::text = 'unresolved' THEN
    IF coalesce(NEW.labor_hours, 0) <> 0 OR coalesce(NEW.material_cost, 0) <> 0
       OR coalesce(NEW.equipment_cost, 0) <> 0 OR coalesce(NEW.subcontractor_cost, 0) <> 0
       OR coalesce(NEW.other_cost, 0) <> 0 THEN
      NEW.pricing_provenance := coalesce(NEW.pricing_provenance, '{}'::jsonb)
        || jsonb_build_object('clearedOnUnresolved', jsonb_build_object(
             'laborHours', NEW.labor_hours,
             'materialCost', NEW.material_cost,
             'equipmentCost', NEW.equipment_cost,
             'subcontractorCost', NEW.subcontractor_cost,
             'otherCost', NEW.other_cost,
             'formula', NEW.labor_hours_formula,
             'at', now()));
    END IF;
    NEW.labor_hours := 0;
    NEW.material_cost := 0;
    NEW.equipment_cost := 0;
    NEW.subcontractor_cost := 0;
    NEW.other_cost := 0;
    NEW.labor_hours_formula := 'awaiting quantity - not priced';
    NEW.quantity_basis := coalesce(nullif(NEW.quantity_basis, ''), 'needs_evidence');
  ELSE
    IF coalesce(NEW.quantity_basis, '') <> ALL (v_allowed) THEN
      IF v_fee THEN
        NEW.quantity_basis := 'fee_scope';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Fee or permit line: one occurrence, no measured quantity.');
      ELSIF v_contractor THEN
        NEW.quantity_basis := 'contractor_entered';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Quantity entered or accepted by the contractor.');
      ELSIF lower(coalesce(NEW.description, '')) ~ '\m[0-9]+\M'
            AND coalesce(NEW.unit_key::text, '') = 'each' THEN
        NEW.quantity_basis := 'scope_stated_count';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Count stated in the scope wording.');
      ELSE
        NEW.quantity_basis := 'ballpark_allowance';
        NEW.quantity_basis_note := coalesce(NEW.quantity_basis_note,
          'Assumed quantity - ballpark allowance. Confirm on site before the detailed estimate.');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;
