-- Company logo objects live under: <organization_id>/<uuid>.<ext>
-- Access is scoped to members of that organization via public.is_org_member().

CREATE POLICY "org members read own branding"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "org members upload own branding"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'org-branding'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "org members update own branding"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'org-branding'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "org members delete own branding"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'org-branding'
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.is_org_member(((storage.foldername(name))[1])::uuid)
);
