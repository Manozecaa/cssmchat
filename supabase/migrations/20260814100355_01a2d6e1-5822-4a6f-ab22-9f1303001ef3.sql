ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS avatar_path text,
  ADD COLUMN IF NOT EXISTS only_admins_send boolean NOT NULL DEFAULT false;

ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_send boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_app_settings_updated ON public.app_settings;
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('session_timeout_minutes', '60'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Participantes: administradores do grupo podem editar os demais
DROP POLICY IF EXISTS members_update_self ON public.conversation_members;
CREATE POLICY members_update_self ON public.conversation_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_conversation_admin(conversation_id, auth.uid()));

-- Envio de mensagens respeita a restrição do grupo
DROP POLICY IF EXISTS messages_insert_members ON public.messages;
CREATE POLICY messages_insert_members ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id, auth.uid())
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id AND c.only_admins_send
      )
      OR EXISTS (
        SELECT 1 FROM public.conversation_members m
        WHERE m.conversation_id = messages.conversation_id
          AND m.user_id = auth.uid()
          AND (m.is_admin OR m.can_send)
      )
    )
  );