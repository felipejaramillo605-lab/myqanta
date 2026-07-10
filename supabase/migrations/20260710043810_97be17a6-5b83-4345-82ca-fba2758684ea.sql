
CREATE TYPE public.crm_deal_stage AS ENUM ('lead','qualified','proposal','negotiation','won','lost');
CREATE TYPE public.crm_activity_kind AS ENUM ('note','call','email','meeting','task');

CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  title text,
  source text,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_contacts_org_idx ON public.crm_contacts(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT ALL ON public.crm_contacts TO service_role;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_contacts read" ON public.crm_contacts FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "crm_contacts write" ON public.crm_contacts FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TABLE public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage public.crm_deal_stage NOT NULL DEFAULT 'lead',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  probability int NOT NULL DEFAULT 20 CHECK (probability BETWEEN 0 AND 100),
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  notes text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_deals_org_stage_idx ON public.crm_deals(org_id, stage);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT ALL ON public.crm_deals TO service_role;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deals read" ON public.crm_deals FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "crm_deals write" ON public.crm_deals FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  kind public.crm_activity_kind NOT NULL DEFAULT 'note',
  subject text,
  body text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_activities_org_idx ON public.crm_activities(org_id, occurred_at DESC);
CREATE INDEX crm_activities_deal_idx ON public.crm_activities(deal_id);
CREATE INDEX crm_activities_contact_idx ON public.crm_activities(contact_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_activities TO service_role;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities read" ON public.crm_activities FOR SELECT TO authenticated USING (public.is_org_member(org_id, auth.uid()));
CREATE POLICY "crm_activities write" ON public.crm_activities FOR ALL TO authenticated
  USING (public.can_write_org(org_id, auth.uid())) WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE TRIGGER crm_contacts_updated BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_deals_updated BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER crm_activities_updated BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
