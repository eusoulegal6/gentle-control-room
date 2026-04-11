
CREATE TABLE public.app_releases (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version text NOT NULL UNIQUE,
  download_url text NOT NULL,
  release_notes text,
  published_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view releases"
  ON public.app_releases FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can create releases"
  ON public.app_releases FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can update releases"
  ON public.app_releases FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Anon can view releases"
  ON public.app_releases FOR SELECT
  TO anon
  USING (true);

CREATE TRIGGER update_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
