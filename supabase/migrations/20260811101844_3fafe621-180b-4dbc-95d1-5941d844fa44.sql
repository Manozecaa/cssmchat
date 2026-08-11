ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS sector text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.admin_credentials
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'secondary',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.admin_credentials
  DROP CONSTRAINT IF EXISTS admin_credentials_role_check;
ALTER TABLE public.admin_credentials
  ADD CONSTRAINT admin_credentials_role_check CHECK (role IN ('primary','secondary'));

UPDATE public.admin_credentials
SET role = 'primary'
WHERE id = (SELECT id FROM public.admin_credentials ORDER BY created_at ASC LIMIT 1);

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (is_active OR id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, username, full_name, avatar_url, description, sector)
  VALUES (
    NEW.id,
    NEW.email,
    lower(COALESCE(NEW.raw_user_meta_data->>'username', split_part(COALESCE(NEW.email, 'usuario'), '@', 1))),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email, 'usuario'), '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'description',
    NEW.raw_user_meta_data->>'sector'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;