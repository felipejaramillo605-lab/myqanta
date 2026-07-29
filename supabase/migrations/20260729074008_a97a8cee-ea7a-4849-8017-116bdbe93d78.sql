-- 1) employee-photos: folder-based ownership + org-scoped reads
DROP POLICY IF EXISTS "employee photos read" ON storage.objects;
DROP POLICY IF EXISTS "employee photos insert" ON storage.objects;
DROP POLICY IF EXISTS "employee photos update" ON storage.objects;
DROP POLICY IF EXISTS "employee photos delete" ON storage.objects;

CREATE POLICY "employee_photos_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "employee_photos_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "employee_photos_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "employee_photos_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.organization_members me
      JOIN public.organization_members owner ON owner.org_id = me.org_id
      WHERE me.user_id = auth.uid()
        AND owner.user_id::text = (storage.foldername(objects.name))[1]
    )
  )
);

-- 2) Revoke EXECUTE on SECURITY DEFINER functions that those roles must not call
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_journal_entry_no(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_active_org(uuid) FROM anon, authenticated;