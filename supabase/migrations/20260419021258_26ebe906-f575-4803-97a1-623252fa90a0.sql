
-- =====================
-- Staff username: email format + case-insensitive uniqueness
-- =====================

-- Lowercase usernames on insert/update so all comparisons are case-insensitive
CREATE OR REPLACE FUNCTION public.normalize_desktop_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(trim(NEW.username));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_desktop_username ON public.desktop_users;
CREATE TRIGGER trg_normalize_desktop_username
BEFORE INSERT OR UPDATE OF username ON public.desktop_users
FOR EACH ROW EXECUTE FUNCTION public.normalize_desktop_username();

-- Backfill existing usernames to lowercase (safe — no collisions expected for already-unique data;
-- if collisions exist, the unique index below will fail and surface the problem)
UPDATE public.desktop_users SET username = lower(trim(username)) WHERE username <> lower(trim(username));

-- Unique index on lower(username) (the column is also UNIQUE, but this is explicit & defensive)
CREATE UNIQUE INDEX IF NOT EXISTS desktop_users_username_lower_unique
  ON public.desktop_users (lower(username));

-- Email-format check, but ONLY enforced for newly inserted/edited rows.
-- Existing non-email usernames keep working (per user requirement).
CREATE OR REPLACE FUNCTION public.validate_desktop_username_email_format()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- On INSERT: always validate
  -- On UPDATE: only validate if username actually changed
  IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.username IS DISTINCT FROM OLD.username) THEN
    IF NEW.username !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
      RAISE EXCEPTION 'Staff username must be in email format (e.g. name@example.com)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_desktop_username_email_format ON public.desktop_users;
CREATE TRIGGER trg_validate_desktop_username_email_format
BEFORE INSERT OR UPDATE OF username ON public.desktop_users
FOR EACH ROW EXECUTE FUNCTION public.validate_desktop_username_email_format();

-- =====================
-- Admin 2FA: settings + challenges
-- =====================

CREATE TABLE IF NOT EXISTS public.admin_mfa_settings (
  admin_id uuid PRIMARY KEY REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_mfa_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own mfa settings"
ON public.admin_mfa_settings FOR SELECT
TO authenticated
USING (admin_id = auth.uid());

CREATE POLICY "Admins insert own mfa settings"
ON public.admin_mfa_settings FOR INSERT
TO authenticated
WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Admins update own mfa settings"
ON public.admin_mfa_settings FOR UPDATE
TO authenticated
USING (admin_id = auth.uid())
WITH CHECK (admin_id = auth.uid());

DROP TRIGGER IF EXISTS trg_admin_mfa_settings_updated_at ON public.admin_mfa_settings;
CREATE TRIGGER trg_admin_mfa_settings_updated_at
BEFORE UPDATE ON public.admin_mfa_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Challenges: short-lived 6-digit codes. Hashed at rest.
CREATE TABLE IF NOT EXISTS public.admin_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES public.admin_profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_challenges_admin_active
  ON public.admin_mfa_challenges (admin_id, created_at DESC)
  WHERE consumed_at IS NULL;

ALTER TABLE public.admin_mfa_challenges ENABLE ROW LEVEL SECURITY;

-- No client access — only the edge function (service role) reads/writes.
CREATE POLICY "No direct client access to mfa challenges"
ON public.admin_mfa_challenges FOR SELECT
TO authenticated
USING (false);
