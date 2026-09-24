CREATE TABLE public.permit_fee_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_key text NOT NULL,
  jurisdiction_scope text NOT NULL CHECK (jurisdiction_scope IN ('city','county','state','national')),
  city text,
  county text,
  state text,
  postal_code text,
  country_code text NOT NULL DEFAULT 'US',
  permit_type text NOT NULL CHECK (permit_type IN ('building','electrical','plumbing','mechanical','roofing','demolition','zoning','occupancy')),
  work_class text NOT NULL DEFAULT 'any',
  calc_method text NOT NULL CHECK (calc_method IN ('flat','range_allowance','percent_of_valuation','per_fixture','per_device','per_sqft','tiered')),
  base_amount numeric,
  min_amount numeric,
  max_amount numeric,
  rate numeric,
  low_amount numeric,
  high_amount numeric,
  effective_date date NOT NULL DEFAULT current_date,
  library_version text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('contractor','municipal','state','national_benchmark')),
  source_title text NOT NULL,
  source_url text,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('verified','high','medium','low','needs_confirmation')),
  bundles text[] NOT NULL DEFAULT '{}',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX permit_fee_rules_key_uniq
  ON public.permit_fee_rules (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key, library_version);
CREATE INDEX permit_fee_rules_lookup
  ON public.permit_fee_rules (permit_type, work_class, jurisdiction_scope) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permit_fee_rules TO authenticated;
GRANT ALL ON public.permit_fee_rules TO service_role;

ALTER TABLE public.permit_fee_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permit rules: read national library and own org rules"
  ON public.permit_fee_rules FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "permit rules: org members insert own jurisdiction rules"
  ON public.permit_fee_rules FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE POLICY "permit rules: org members update own jurisdiction rules"
  ON public.permit_fee_rules FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE POLICY "permit rules: org members delete own jurisdiction rules"
  ON public.permit_fee_rules FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));

CREATE TRIGGER permit_fee_rules_set_updated_at
  BEFORE UPDATE ON public.permit_fee_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.permit_fee_rules (
  rule_key, jurisdiction_scope, permit_type, work_class, calc_method,
  base_amount, min_amount, max_amount, rate, low_amount, high_amount,
  effective_date, library_version, source_type, source_title, source_url, confidence, bundles, notes
) VALUES
('nat-electrical-minor','national','electrical','electrical_minor','range_allowance',NULL,NULL,NULL,NULL,50,350,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],'Electrical commonly $50-$350, or base plus per-device fee.'),
('nat-electrical-devices','national','electrical','electrical_devices','per_device',60,75,500,12,NULL,NULL,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],'Base permit plus per-circuit/device fee; scales with known counts.'),
('nat-electrical-service','national','electrical','electrical_service','range_allowance',NULL,NULL,NULL,NULL,150,500,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Service/panel/rewiring work sits at the top of the $10-$500 band.'),
('nat-plumbing-minor','national','plumbing','plumbing_minor','range_allowance',NULL,NULL,NULL,NULL,50,300,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],'Plumbing commonly $30-$500, or per fixture.'),
('nat-plumbing-fixtures','national','plumbing','plumbing_fixtures','per_fixture',70,90,500,25,NULL,NULL,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],NULL),
('nat-plumbing-roughin','national','plumbing','plumbing_rough_in','range_allowance',NULL,NULL,NULL,NULL,150,500,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],NULL),
('nat-mechanical','national','mechanical','hvac_equipment','range_allowance',NULL,NULL,NULL,NULL,250,400,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'HVAC $250-$400 for equipment or duct modification.'),
('nat-roofing','national','roofing','roofing','range_allowance',NULL,NULL,NULL,NULL,250,500,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],NULL),
('nat-demolition','national','demolition','demolition','range_allowance',NULL,NULL,NULL,NULL,150,300,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Demolition about $200 nationally.'),
('nat-windows','national','building','windows','per_device',0,100,1000,50,NULL,NULL,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Roughly $50 per window; applied only where a permit is likely.'),
('nat-deck','national','building','deck','range_allowance',NULL,NULL,NULL,NULL,100,300,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],NULL),
('nat-fence','national','building','fence','range_allowance',NULL,NULL,NULL,NULL,50,300,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],NULL),
('nat-shed','national','building','shed','range_allowance',NULL,NULL,NULL,NULL,50,300,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],NULL),
('nat-zoning','national','zoning','zoning','range_allowance',NULL,NULL,NULL,NULL,100,500,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],NULL),
('nat-occupancy','national','occupancy','occupancy','range_allowance',NULL,NULL,NULL,NULL,100,400,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY[]::text[],'Optional certificate / additional inspection fee - needs review.'),
('nat-building-simple','national','building','structural_minor','range_allowance',NULL,NULL,NULL,NULL,150,2000,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Construction permits commonly $150-$2,000.'),
('nat-building-conversion','national','building','conversion','range_allowance',NULL,NULL,NULL,NULL,1200,2000,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY['electrical','plumbing','mechanical']::text[],'Garage/basement conversion $1,200-$2,000 combined; many jurisdictions bundle trade permits into this master permit.'),
('nat-building-kitchen','national','building','kitchen_remodel','range_allowance',NULL,NULL,NULL,NULL,700,1400,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Kitchen remodel ~$1,000 midpoint.'),
('nat-building-bathroom','national','building','bathroom_remodel','range_allowance',NULL,NULL,NULL,NULL,400,800,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Bathroom remodel ~$600 midpoint.'),
('nat-building-basement-finish','national','building','basement_finish','range_allowance',NULL,NULL,NULL,NULL,350,650,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY[]::text[],'Basement finish ~$500 for straightforward permitted finish.'),
('nat-building-addition','national','building','addition','range_allowance',NULL,NULL,NULL,NULL,900,1700,'2026-01-01','national-2026.1','national_benchmark','Angi 2026 building permit cost research','https://www.angi.com/articles/how-much-does-building-permit-cost.htm','low',ARRAY['electrical','plumbing','mechanical']::text[],'Home addition ~$1,300 starting allowance; larger jobs use valuation.'),
('nat-building-valuation','national','building','whole_home_renovation','percent_of_valuation',NULL,500,25000,1.25,NULL,NULL,'2026-01-01','national-2026.1','national_benchmark','HomeGuide 2026 building permit cost research','https://homeguide.com/costs/building-permit-cost','low',ARRAY['electrical','plumbing','mechanical']::text[],'Permit fees average 0.5%-2.0% of construction cost; 1.25% configurable midpoint with guardrails.');
