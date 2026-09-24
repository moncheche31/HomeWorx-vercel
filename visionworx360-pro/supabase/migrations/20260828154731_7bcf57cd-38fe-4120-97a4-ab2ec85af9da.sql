CREATE TABLE public.assembly_expansions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trade_key text NOT NULL,
  signature text NOT NULL,
  scope_phrase text NOT NULL,
  assembly_label text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  prompt_version text NOT NULL,
  review_status text NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','reviewed')),
  is_contractor_edited boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, signature)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_expansions TO authenticated;
GRANT ALL ON public.assembly_expansions TO service_role;
ALTER TABLE public.assembly_expansions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org assembly expansions" ON public.assembly_expansions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Members write org assembly expansions" ON public.assembly_expansions
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members update org assembly expansions" ON public.assembly_expansions
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members delete org assembly expansions" ON public.assembly_expansions
  FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

CREATE TRIGGER set_assembly_expansions_updated_at
  BEFORE UPDATE ON public.assembly_expansions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assembly_expansion_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expansion_id uuid NOT NULL REFERENCES public.assembly_expansions(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  name text NOT NULL,
  search_terms text[] NOT NULL DEFAULT '{}',
  typical_unit text,
  inclusion text NOT NULL DEFAULT 'standard' CHECK (inclusion IN ('standard','conditional','existing_typically')),
  quantity_basis text NOT NULL DEFAULT 'manual' CHECK (quantity_basis IN ('same_as_parent','eave_lf','ridge_lf','perimeter_lf','per_penetration','factor','manual')),
  reason text,
  is_included boolean NOT NULL DEFAULT true,
  quantity numeric,
  is_contractor_authored boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expansion_id, sequence)
);

CREATE INDEX idx_assembly_expansion_components_expansion
  ON public.assembly_expansion_components(expansion_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assembly_expansion_components TO authenticated;
GRANT ALL ON public.assembly_expansion_components TO service_role;
ALTER TABLE public.assembly_expansion_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read org expansion components" ON public.assembly_expansion_components
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "Members write org expansion components" ON public.assembly_expansion_components
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members update org expansion components" ON public.assembly_expansion_components
  FOR UPDATE TO authenticated USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "Members delete org expansion components" ON public.assembly_expansion_components
  FOR DELETE TO authenticated USING (public.is_org_member(organization_id));

CREATE TRIGGER set_assembly_expansion_components_updated_at
  BEFORE UPDATE ON public.assembly_expansion_components
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.estimate_line_items
  ADD COLUMN IF NOT EXISTS assembly_expansion_id uuid REFERENCES public.assembly_expansions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assembly_expansion_status text
    CHECK (assembly_expansion_status IN ('auto_expanded_unreviewed','reviewed','not_expanded'));
