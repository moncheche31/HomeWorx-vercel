CREATE TABLE public.contractor_terminology_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wrong_term text NOT NULL,
  wrong_term_norm text GENERATED ALWAYS AS (lower(btrim(regexp_replace(wrong_term, '\s+', ' ', 'g')))) STORED,
  corrected_term text NOT NULL,
  trigger_phrase text,
  trigger_phrase_norm text GENERATED ALWAYS AS (lower(btrim(regexp_replace(coalesce(trigger_phrase,''), '\s+', ' ', 'g')))) STORED,
  context_scope text NOT NULL DEFAULT 'any' CHECK (context_scope IN ('any','interior','exterior')),
  trade_key text,
  capture_method text NOT NULL DEFAULT 'explicit_correction' CHECK (capture_method IN ('explicit_correction','scope_text_edit','book_match_correction')),
  source_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  source_evidence text,
  is_active boolean NOT NULL DEFAULT true,
  applied_count integer NOT NULL DEFAULT 0,
  last_applied_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX contractor_terminology_corrections_unique
  ON public.contractor_terminology_corrections (organization_id, wrong_term_norm, trigger_phrase_norm, context_scope, coalesce(trade_key,''));
CREATE INDEX contractor_terminology_corrections_org_active
  ON public.contractor_terminology_corrections (organization_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contractor_terminology_corrections TO authenticated;
GRANT ALL ON public.contractor_terminology_corrections TO service_role;

ALTER TABLE public.contractor_terminology_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read terminology corrections"
  ON public.contractor_terminology_corrections FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));
CREATE POLICY "org members create terminology corrections"
  ON public.contractor_terminology_corrections FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org members update terminology corrections"
  ON public.contractor_terminology_corrections FOR UPDATE TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY "org members delete terminology corrections"
  ON public.contractor_terminology_corrections FOR DELETE TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TRIGGER set_contractor_terminology_corrections_updated
  BEFORE UPDATE ON public.contractor_terminology_corrections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
