
-- ===== ENUMS =====
CREATE TYPE public.org_role AS ENUM ('owner','admin','member','viewer');

-- ===== ORGANIZATIONS =====
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);
CREATE INDEX organization_members_org_idx ON public.organization_members(org_id);

CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  role public.org_role NOT NULL DEFAULT 'member',
  invited_email text,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX organization_invites_org_idx ON public.organization_invites(org_id);

CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== HELPER FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = _org_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _user_id uuid, _min_role public.org_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = _org_id AND m.user_id = _user_id
      AND (
        CASE m.role
          WHEN 'owner' THEN 4
          WHEN 'admin' THEN 3
          WHEN 'member' THEN 2
          WHEN 'viewer' THEN 1
        END
      ) >=
      (
        CASE _min_role
          WHEN 'owner' THEN 4
          WHEN 'admin' THEN 3
          WHEN 'member' THEN 2
          WHEN 'viewer' THEN 1
        END
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_write_org(_org_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(_org_id, _user_id, 'member'::public.org_role)
$$;

-- ===== PROFILES: active org =====
ALTER TABLE public.profiles ADD COLUMN active_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- ===== ADD org_id TO EXISTING TABLES =====
ALTER TABLE public.finance_accounts     ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.finance_transactions ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.finance_statements   ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.inv_parties          ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.inv_products         ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.inv_movements        ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.inv_invoices         ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.tasks                ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.habits               ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.habit_logs           ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.events               ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ===== BACKFILL: create personal org per existing user =====
DO $$
DECLARE
  u record;
  new_org_id uuid;
BEGIN
  FOR u IN SELECT id, COALESCE(raw_user_meta_data->>'full_name', email, 'Personal') AS display_name FROM auth.users LOOP
    INSERT INTO public.organizations (name, created_by)
      VALUES (COALESCE(u.display_name, 'Personal') || ' Workspace', u.id)
      RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (new_org_id, u.id, 'owner');

    UPDATE public.profiles SET active_org_id = new_org_id WHERE id = u.id;

    UPDATE public.finance_accounts     SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.finance_transactions SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.finance_statements   SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.inv_parties          SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.inv_products         SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.inv_movements        SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.inv_invoices         SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.tasks                SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.habits               SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.habit_logs           SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.events               SET org_id = new_org_id WHERE user_id = u.id AND org_id IS NULL;
  END LOOP;
END $$;

-- ===== NOT NULL after backfill =====
ALTER TABLE public.finance_accounts     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.finance_transactions ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.finance_statements   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.inv_parties          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.inv_products         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.inv_movements        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.inv_invoices         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.tasks                ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.habits               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.habit_logs           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.events               ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX finance_tx_org_date ON public.finance_transactions(org_id, occurred_on DESC);
CREATE INDEX inv_products_org_idx ON public.inv_products(org_id);
CREATE INDEX inv_movements_org_idx ON public.inv_movements(org_id);
CREATE INDEX tasks_org_idx ON public.tasks(org_id);
CREATE INDEX events_org_idx ON public.events(org_id);
CREATE INDEX habits_org_idx ON public.habits(org_id);

-- ===== RLS POLICIES: organizations =====
CREATE POLICY "members view org" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id, auth.uid()));
CREATE POLICY "authenticated create org" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "owner updates org" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'owner'))
  WITH CHECK (public.has_org_role(id, auth.uid(), 'owner'));
CREATE POLICY "owner deletes org" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'owner'));

-- organization_members
CREATE POLICY "members view memberships" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "admin manages members" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') OR user_id = auth.uid());
CREATE POLICY "admin updates members" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "admin removes members or self leaves" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin') OR user_id = auth.uid());

-- organization_invites
CREATE POLICY "admin views invites" ON public.organization_invites
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "admin creates invites" ON public.organization_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') AND invited_by = auth.uid());
CREATE POLICY "admin revokes invites" ON public.organization_invites
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "admin deletes invites" ON public.organization_invites
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

-- ===== REPLACE EXISTING TABLE POLICIES =====
DROP POLICY IF EXISTS "own accounts" ON public.finance_accounts;
DROP POLICY IF EXISTS "own transactions" ON public.finance_transactions;
DROP POLICY IF EXISTS "own statements" ON public.finance_statements;
DROP POLICY IF EXISTS "own parties" ON public.inv_parties;
DROP POLICY IF EXISTS "own products" ON public.inv_products;
DROP POLICY IF EXISTS "own movements" ON public.inv_movements;
DROP POLICY IF EXISTS "own invoices" ON public.inv_invoices;
DROP POLICY IF EXISTS "own tasks" ON public.tasks;
DROP POLICY IF EXISTS "own habits" ON public.habits;
DROP POLICY IF EXISTS "own habit_logs" ON public.habit_logs;
DROP POLICY IF EXISTS "own events" ON public.events;

-- Macro helper: build read + write policies per table
DO $$
DECLARE
  tname text;
  tables text[] := ARRAY[
    'finance_accounts','finance_transactions','finance_statements',
    'inv_parties','inv_products','inv_movements','inv_invoices',
    'tasks','habits','habit_logs','events'
  ];
BEGIN
  FOREACH tname IN ARRAY tables LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()))', 'org read ' || tname, tname);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_write_org(org_id, auth.uid()))', 'org insert ' || tname, tname);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()))', 'org update ' || tname, tname);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_write_org(org_id, auth.uid()))', 'org delete ' || tname, tname);
  END LOOP;
END $$;

-- ===== NEW USER: create personal org, owner membership, set active =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id uuid;
  display_name text;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Personal');

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, display_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.organizations (name, created_by)
  VALUES (display_name || ' Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  UPDATE public.profiles SET active_org_id = new_org_id WHERE id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Helper: get effective active org for current auth.uid() =====
CREATE OR REPLACE FUNCTION public.get_active_org(_user_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  oid uuid;
BEGIN
  SELECT active_org_id INTO oid FROM public.profiles WHERE id = _user_id;
  IF oid IS NULL OR NOT public.is_org_member(oid, _user_id) THEN
    SELECT org_id INTO oid FROM public.organization_members WHERE user_id = _user_id ORDER BY created_at LIMIT 1;
    IF oid IS NOT NULL THEN
      UPDATE public.profiles SET active_org_id = oid WHERE id = _user_id;
    END IF;
  END IF;
  RETURN oid;
END $$;
