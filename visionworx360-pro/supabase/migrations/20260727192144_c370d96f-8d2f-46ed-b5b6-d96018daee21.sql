-- 1. Membership helper (authoritative tenant check via user_roles)
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND organization_id = _org
  );
$$;

-- 2. Enums
CREATE TYPE public.client_status AS ENUM ('active', 'archived');
CREATE TYPE public.contact_method AS ENUM ('email', 'phone', 'sms', 'any');
CREATE TYPE public.project_status AS ENUM (
  'lead','site_visit_scheduled','site_visit_complete',
  'estimate_in_progress','estimate_sent','customer_reviewing',
  'approved','scheduled','construction','completed','archived'
);
CREATE TYPE public.project_priority AS ENUM ('low','normal','high','urgent');

-- 3. clients
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  first_name text,
  last_name text,
  company text,
  email text,
  phone text,
  secondary_phone text,
  address_line1 text,
  city text,
  region text,
  postal_code text,
  notes text,
  preferred_contact public.contact_method NOT NULL DEFAULT 'any',
  status public.client_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_org_idx ON public.clients(organization_id);
CREATE INDEX clients_org_status_idx ON public.clients(organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. properties
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  nickname text,
  street text,
  city text,
  region text,
  postal_code text,
  county text,
  year_built integer,
  square_footage integer,
  bedrooms numeric,
  bathrooms numeric,
  stories integer,
  construction_type text,
  occupied boolean,
  notes text,
  gps jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX properties_org_idx ON public.properties(organization_id);
CREATE INDEX properties_client_idx ON public.properties(client_id);
GRANT SELECT, INSERT, UPDATE ON public.properties TO authenticated;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY properties_select ON public.properties FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY properties_insert ON public.properties FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY properties_update ON public.properties FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE TRIGGER properties_set_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  project_type text,
  status public.project_status NOT NULL DEFAULT 'lead',
  priority public.project_priority NOT NULL DEFAULT 'normal',
  budget numeric,
  target_gross_margin numeric,
  target_completion date,
  description text,
  internal_notes text,
  thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_idx ON public.projects(organization_id);
CREATE INDEX projects_client_idx ON public.projects(client_id);
CREATE INDEX projects_property_idx ON public.projects(property_id);
CREATE INDEX projects_org_status_idx ON public.projects(organization_id, status);
GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id) AND created_by = auth.uid());
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
