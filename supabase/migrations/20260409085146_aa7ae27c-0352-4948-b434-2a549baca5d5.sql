
-- ===========================================
-- 1. admin_profiles table
-- ===========================================
CREATE TABLE public.admin_profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their own profile"
  ON public.admin_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can update their own profile"
  ON public.admin_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can insert their own profile"
  ON public.admin_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ===========================================
-- 2. desktop_users table
-- ===========================================
CREATE TABLE public.desktop_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  must_reset_password BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.desktop_users ENABLE ROW LEVEL SECURITY;

-- Only admin users (via edge functions with service role) should access this table.
-- Authenticated admins can read desktop users.
CREATE POLICY "Authenticated admins can read desktop_users"
  ON public.desktop_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = auth.uid())
  );

-- No direct insert/update/delete from client - all mutations go through edge functions with service role.

-- ===========================================
-- 3. desktop_sessions table
-- ===========================================
CREATE TABLE public.desktop_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  desktop_user_id UUID NOT NULL REFERENCES public.desktop_users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.desktop_sessions ENABLE ROW LEVEL SECURITY;

-- No client access - managed entirely through edge functions with service role.

CREATE INDEX idx_desktop_sessions_user ON public.desktop_sessions(desktop_user_id);
CREATE UNIQUE INDEX idx_desktop_sessions_token ON public.desktop_sessions(refresh_token_hash);

-- ===========================================
-- 4. alerts table
-- ===========================================
CREATE TABLE public.alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES public.desktop_users(id) ON DELETE CASCADE,
  recipient_username TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Alert',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DELIVERED', 'READ')),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.admin_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Admins can read all alerts
CREATE POLICY "Authenticated admins can read alerts"
  ON public.alerts FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_profiles WHERE id = auth.uid())
  );

-- Enable realtime for desktop clients (via service role subscriptions handled by edge logic)
-- Desktop users need SELECT on their own alerts for realtime subscriptions
CREATE POLICY "Desktop users cannot directly access alerts"
  ON public.alerts FOR SELECT
  TO anon
  USING (false);

CREATE INDEX idx_alerts_recipient ON public.alerts(recipient_id, created_at DESC);
CREATE INDEX idx_alerts_status ON public.alerts(status, created_at DESC);

-- ===========================================
-- 5. updated_at trigger function
-- ===========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_admin_profiles_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_desktop_users_updated_at
  BEFORE UPDATE ON public.desktop_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_desktop_sessions_updated_at
  BEFORE UPDATE ON public.desktop_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- 6. Enable Realtime for alerts table
-- ===========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
