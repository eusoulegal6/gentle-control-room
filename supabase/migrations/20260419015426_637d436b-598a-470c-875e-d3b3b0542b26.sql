
-- Security definer function to check super admin role without recursion
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles
    WHERE id = _user_id AND role = 'super_admin'
  )
$$;

-- Helper: check if user is any admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_profiles WHERE id = _user_id
  )
$$;

-- =====================
-- desktop_users: scope by created_by
-- =====================
DROP POLICY IF EXISTS "Authenticated admins can read desktop_users" ON public.desktop_users;

CREATE POLICY "Admins read own desktop_users"
ON public.desktop_users FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR public.is_super_admin(auth.uid())
);

-- =====================
-- alerts: scope by created_by (sender)
-- =====================
DROP POLICY IF EXISTS "Authenticated admins can read alerts" ON public.alerts;

CREATE POLICY "Admins read own alerts"
ON public.alerts FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() OR public.is_super_admin(auth.uid())
);

-- =====================
-- user_groups: scope by created_by
-- =====================
DROP POLICY IF EXISTS "Admins can view groups" ON public.user_groups;
DROP POLICY IF EXISTS "Admins can update groups" ON public.user_groups;
DROP POLICY IF EXISTS "Admins can delete groups" ON public.user_groups;
DROP POLICY IF EXISTS "Admins can create groups" ON public.user_groups;

CREATE POLICY "Admins view own groups"
ON public.user_groups FOR SELECT
TO authenticated
USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins create own groups"
ON public.user_groups FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid() AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update own groups"
ON public.user_groups FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()))
WITH CHECK (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins delete own groups"
ON public.user_groups FOR DELETE
TO authenticated
USING (created_by = auth.uid() OR public.is_super_admin(auth.uid()));

-- Set created_by automatically to auth.uid() on insert if null
CREATE OR REPLACE FUNCTION public.set_user_groups_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_user_groups_created_by ON public.user_groups;
CREATE TRIGGER trg_set_user_groups_created_by
BEFORE INSERT ON public.user_groups
FOR EACH ROW EXECUTE FUNCTION public.set_user_groups_created_by();

-- =====================
-- user_group_members: scope through parent group ownership
-- =====================
DROP POLICY IF EXISTS "Admins can view group members" ON public.user_group_members;
DROP POLICY IF EXISTS "Admins can add group members" ON public.user_group_members;
DROP POLICY IF EXISTS "Admins can remove group members" ON public.user_group_members;

CREATE POLICY "Admins view own group members"
ON public.user_group_members FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_groups g
    WHERE g.id = user_group_members.group_id
      AND (g.created_by = auth.uid() OR public.is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Admins add own group members"
ON public.user_group_members FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_groups g
    WHERE g.id = user_group_members.group_id
      AND (g.created_by = auth.uid() OR public.is_super_admin(auth.uid()))
  )
  AND EXISTS (
    SELECT 1 FROM public.desktop_users d
    WHERE d.id = user_group_members.desktop_user_id
      AND (d.created_by = auth.uid() OR public.is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Admins remove own group members"
ON public.user_group_members FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_groups g
    WHERE g.id = user_group_members.group_id
      AND (g.created_by = auth.uid() OR public.is_super_admin(auth.uid()))
  )
);
