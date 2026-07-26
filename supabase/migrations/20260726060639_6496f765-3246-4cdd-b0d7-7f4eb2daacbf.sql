CREATE POLICY "employee photos read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'employee-photos');
CREATE POLICY "employee photos insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'employee-photos');
CREATE POLICY "employee photos update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'employee-photos') WITH CHECK (bucket_id = 'employee-photos');
CREATE POLICY "employee photos delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'employee-photos');
