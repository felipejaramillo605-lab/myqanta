
-- Enums
CREATE TYPE public.project_status AS ENUM ('active','paused','completed','cancelled');
CREATE TYPE public.project_member_role AS ENUM ('lead','member','viewer');

-- projects
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  client_name text,
  customer_id uuid REFERENCES public.sales_customers(id) ON DELETE SET NULL,
  status public.project_status NOT NULL DEFAULT 'active',
  description text,
  color text,
  start_date date,
  end_date date,
  budget_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_read_members"
  ON public.projects FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "projects_write_members"
  ON public.projects FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE INDEX idx_projects_org ON public.projects(org_id, status);

CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- project_members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_member_role NOT NULL DEFAULT 'member',
  hourly_rate numeric(10,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_members_read"
  ON public.project_members FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "project_members_write"
  ON public.project_members FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE INDEX idx_project_members_project ON public.project_members(project_id);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);

-- time_entries
CREATE TABLE public.time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT (now()::date),
  hours numeric(6,2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  billable boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Members can see all time entries within their org
CREATE POLICY "time_entries_read"
  ON public.time_entries FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

-- Users can insert their own entries; org admins can insert on behalf
CREATE POLICY "time_entries_insert_own"
  ON public.time_entries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id, auth.uid())
    AND (user_id = auth.uid() OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role))
  );

CREATE POLICY "time_entries_update_own"
  ON public.time_entries FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role))
  WITH CHECK (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "time_entries_delete_own"
  ON public.time_entries FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));

CREATE INDEX idx_time_entries_project ON public.time_entries(project_id, entry_date DESC);
CREATE INDEX idx_time_entries_user_date ON public.time_entries(user_id, entry_date DESC);

CREATE TRIGGER trg_time_entries_updated
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link tasks to projects (optional)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id);
