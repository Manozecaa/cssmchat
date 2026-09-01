CREATE TABLE public.sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sectors TO authenticated;
GRANT ALL ON public.sectors TO service_role;

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY sectors_select_authenticated ON public.sectors
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_sectors_updated
  BEFORE UPDATE ON public.sectors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'comum',
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

INSERT INTO public.sectors (name)
SELECT DISTINCT trim(sector) FROM public.profiles
WHERE sector IS NOT NULL AND trim(sector) <> ''
ON CONFLICT (name) DO NOTHING;