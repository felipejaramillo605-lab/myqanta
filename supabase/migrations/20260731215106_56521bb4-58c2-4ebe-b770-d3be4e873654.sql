-- 1) Least privilege on internal SECURITY DEFINER helpers (no anon use)
REVOKE EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_journal_entry_no(uuid) FROM anon;

-- 2) employee-photos write policies: require org write access, not just own folder
DROP POLICY IF EXISTS employee_photos_insert ON storage.objects;
DROP POLICY IF EXISTS employee_photos_update ON storage.objects;
DROP POLICY IF EXISTS employee_photos_delete ON storage.objects;

CREATE POLICY employee_photos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::public.org_role, 'admin'::public.org_role, 'member'::public.org_role)
  )
);

CREATE POLICY employee_photos_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::public.org_role, 'admin'::public.org_role, 'member'::public.org_role)
  )
)
WITH CHECK (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::public.org_role, 'admin'::public.org_role, 'member'::public.org_role)
  )
);

CREATE POLICY employee_photos_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('owner'::public.org_role, 'admin'::public.org_role, 'member'::public.org_role)
  )
);
