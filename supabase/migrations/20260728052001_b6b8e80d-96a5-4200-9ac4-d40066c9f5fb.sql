CREATE TABLE public.accounting_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'custom',
  order_index integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounting_policies TO authenticated;
GRANT ALL ON public.accounting_policies TO service_role;

ALTER TABLE public.accounting_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read org accounting policies"
  ON public.accounting_policies FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "Admins can insert accounting policies"
  ON public.accounting_policies FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));

CREATE POLICY "Admins can update accounting policies"
  ON public.accounting_policies FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));

CREATE POLICY "Admins can delete accounting policies"
  ON public.accounting_policies FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'::public.org_role));

CREATE INDEX accounting_policies_org_idx ON public.accounting_policies(org_id, order_index);

CREATE TRIGGER update_accounting_policies_updated_at
  BEFORE UPDATE ON public.accounting_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();