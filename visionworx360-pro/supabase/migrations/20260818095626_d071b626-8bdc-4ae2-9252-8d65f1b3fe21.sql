CREATE TABLE public.project_measurement_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('spoken','typed','plan','manual')),
  transcript text,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  file_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurement_captures_project ON public.project_measurement_captures(project_id, created_at DESC);

CREATE TABLE public.project_measurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  capture_id uuid REFERENCES public.project_measurement_captures(id) ON DELETE SET NULL,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('spoken','typed','plan','manual')),
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','ambiguous','confirmed')),
  flag text,
  label text NOT NULL DEFAULT 'Measurement',
  subject text,
  kind text NOT NULL DEFAULT 'single' CHECK (kind IN ('single','pair')),
  inches numeric NOT NULL CHECK (inches >= 0),
  secondary_inches numeric CHECK (secondary_inches IS NULL OR secondary_inches >= 0),
  raw_text text,
  overridden_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurement_items_project ON public.project_measurement_items(project_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_measurement_captures TO authenticated;
GRANT ALL ON public.project_measurement_captures TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_measurement_items TO authenticated;
GRANT ALL ON public.project_measurement_items TO service_role;

ALTER TABLE public.project_measurement_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_measurement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "measurement_captures_select" ON public.project_measurement_captures
  FOR SELECT TO authenticated
  USING (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_captures_insert" ON public.project_measurement_captures
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_captures_update" ON public.project_measurement_captures
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_active_organization_id())
  WITH CHECK (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_captures_delete" ON public.project_measurement_captures
  FOR DELETE TO authenticated
  USING (organization_id = public.current_active_organization_id());

CREATE POLICY "measurement_items_select" ON public.project_measurement_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_items_insert" ON public.project_measurement_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_items_update" ON public.project_measurement_items
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_active_organization_id())
  WITH CHECK (organization_id = public.current_active_organization_id());
CREATE POLICY "measurement_items_delete" ON public.project_measurement_items
  FOR DELETE TO authenticated
  USING (organization_id = public.current_active_organization_id());

CREATE TRIGGER set_measurement_captures_updated_at BEFORE UPDATE ON public.project_measurement_captures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_measurement_items_updated_at BEFORE UPDATE ON public.project_measurement_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
