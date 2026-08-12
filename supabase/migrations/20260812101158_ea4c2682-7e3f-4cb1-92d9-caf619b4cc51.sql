ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativo';

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS muted_until timestamptz,
  ADD COLUMN IF NOT EXISTS sound text NOT NULL DEFAULT 'padrao';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_size bigint;

ALTER TABLE public.messages ALTER COLUMN content SET DEFAULT '';

CREATE TABLE IF NOT EXISTS public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_events TO authenticated;
GRANT ALL ON public.conversation_events TO service_role;

ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select_members ON public.conversation_events;
CREATE POLICY events_select_members ON public.conversation_events FOR SELECT TO authenticated
  USING (public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS events_insert_members ON public.conversation_events;
CREATE POLICY events_insert_members ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_conversation_member(conversation_id, auth.uid()));

DROP POLICY IF EXISTS events_update_own ON public.conversation_events;
CREATE POLICY events_update_own ON public.conversation_events FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS events_delete_own ON public.conversation_events;
CREATE POLICY events_delete_own ON public.conversation_events FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_events_conversation ON public.conversation_events(conversation_id, starts_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_events;