DROP POLICY IF EXISTS "project_media_insert" ON storage.objects;

CREATE POLICY "project_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND split_part(storage.objects.name, '/', 1) ~ '^[0-9a-f-]{36}$'
    AND split_part(storage.objects.name, '/', 2) ~ '^[0-9a-f-]{36}$'
    AND public.is_org_member((split_part(storage.objects.name, '/', 1))::uuid)
    AND (split_part(storage.objects.name, '/', 1))::uuid = public.current_active_organization_id()
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project_record
      WHERE project_record.id = (split_part(storage.objects.name, '/', 2))::uuid
        AND project_record.organization_id = (split_part(storage.objects.name, '/', 1))::uuid
    )
    AND split_part(storage.objects.name, '/', 3) IN ('photos', 'documents')
  );
