DROP POLICY IF EXISTS "conversations_select_members" ON public.conversations;
CREATE POLICY "conversations_select_members"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  public.is_conversation_member(id, auth.uid())
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "members_insert" ON public.conversation_members;
CREATE POLICY "members_insert"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_conversation_admin(conversation_id, auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_id
      AND c.created_by = auth.uid()
  )
);

DROP FUNCTION IF EXISTS public.is_conversation_creator(uuid, uuid);