DROP POLICY IF EXISTS chat_files_insert ON storage.objects;
CREATE POLICY chat_files_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-files' AND public.is_conversation_member((split_part(name, '/', 1))::uuid, auth.uid()));

DROP POLICY IF EXISTS chat_files_select ON storage.objects;
CREATE POLICY chat_files_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-files' AND public.is_conversation_member((split_part(name, '/', 1))::uuid, auth.uid()));

DROP POLICY IF EXISTS chat_files_delete ON storage.objects;
CREATE POLICY chat_files_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-files' AND owner = auth.uid());