ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS last_delivered_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 30,
  conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.calendar_event_participants (
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_event_participants TO authenticated;
GRANT ALL ON public.calendar_event_participants TO service_role;
ALTER TABLE public.calendar_event_participants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_calendar_event_owner(_event_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.calendar_events e WHERE e.id = _event_id AND e.created_by = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_calendar_event_participant(_event_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.calendar_event_participants p WHERE p.event_id = _event_id AND p.user_id = _user_id);
$$;

CREATE POLICY cal_events_select ON public.calendar_events FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_calendar_event_participant(id, auth.uid()));
CREATE POLICY cal_events_insert ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY cal_events_update ON public.calendar_events FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY cal_events_delete ON public.calendar_events FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY cal_parts_select ON public.calendar_event_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_calendar_event_owner(event_id, auth.uid()) OR public.is_calendar_event_participant(event_id, auth.uid()));
CREATE POLICY cal_parts_insert ON public.calendar_event_participants FOR INSERT TO authenticated
  WITH CHECK (public.is_calendar_event_owner(event_id, auth.uid()));
CREATE POLICY cal_parts_delete ON public.calendar_event_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_calendar_event_owner(event_id, auth.uid()));

CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();