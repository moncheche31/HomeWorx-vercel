DROP POLICY IF EXISTS "project_media_select" ON storage.objects;
DROP POLICY IF EXISTS "project_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "project_media_update" ON storage.objects;
DROP POLICY IF EXISTS "project_media_delete" ON storage.objects;

CREATE POLICY "project_media_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-media'
    AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "project_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND split_part(name, '/', 2) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(name, '/', 1))::uuid)
    AND (split_part(name, '/', 1))::uuid = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = (split_part(name, '/', 2))::uuid
        AND p.organization_id = (split_part(name, '/', 1))::uuid
    )
    AND split_part(name, '/', 3) IN ('photos','documents')
  );

CREATE POLICY "project_media_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-media'
    AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "project_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-media'
    AND split_part(name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(name, '/', 1))::uuid)
  );
