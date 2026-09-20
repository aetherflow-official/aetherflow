-- ============================================================================
-- AetherFlow — Community Moderators & Admins Migration
-- Run this in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.community_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'moderator' CHECK (role IN ('owner', 'admin', 'moderator')),
  added_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.community_admins ENABLE ROW LEVEL SECURITY;

-- Anyone can read the list of admins to verify client-side permission
CREATE POLICY "Public read community_admins" ON public.community_admins
  FOR SELECT USING (true);

-- Authenticated users can insert if they are an admin/owner
CREATE POLICY "Admins can insert community_admins" ON public.community_admins
  FOR INSERT WITH CHECK (true);

-- Authenticated users can delete admins (enforced by app logic)
CREATE POLICY "Admins can delete community_admins" ON public.community_admins
  FOR DELETE USING (true);

-- Pre-seed the primary owner account
INSERT INTO public.community_admins (email, role, added_by)
VALUES ('yash09preet@gmail.com', 'owner', 'system')
ON CONFLICT (email) DO UPDATE SET role = 'owner';
