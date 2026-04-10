
-- Groups table
CREATE TABLE public.user_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES public.admin_profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique group names
CREATE UNIQUE INDEX idx_user_groups_name ON public.user_groups (lower(name));

-- Enable RLS
ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view groups"
  ON public.user_groups FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can create groups"
  ON public.user_groups FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can update groups"
  ON public.user_groups FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can delete groups"
  ON public.user_groups FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

-- Timestamp trigger
CREATE TRIGGER update_user_groups_updated_at
  BEFORE UPDATE ON public.user_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Group members join table
CREATE TABLE public.user_group_members (
  group_id UUID NOT NULL REFERENCES public.user_groups(id) ON DELETE CASCADE,
  desktop_user_id UUID NOT NULL REFERENCES public.desktop_users(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, desktop_user_id)
);

-- Enable RLS
ALTER TABLE public.user_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view group members"
  ON public.user_group_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can add group members"
  ON public.user_group_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));

CREATE POLICY "Admins can remove group members"
  ON public.user_group_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_profiles WHERE admin_profiles.id = auth.uid()));
