CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.admin_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_credentials TO service_role;

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_admin_credentials_updated
BEFORE UPDATE ON public.admin_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.admin_credentials (username, password_salt, password_hash)
SELECT 'Admin', s.salt, encode(extensions.digest(s.salt || 'Admin', 'sha256'), 'hex')
FROM (SELECT encode(extensions.gen_random_bytes(16), 'hex') AS salt) s;