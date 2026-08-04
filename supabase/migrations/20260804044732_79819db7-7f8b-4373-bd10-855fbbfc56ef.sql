CREATE TABLE public.notion_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  workspace_id text,
  workspace_name text,
  bot_id text,
  connected_by uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notion_connections TO authenticated;
GRANT ALL ON public.notion_connections TO service_role;

ALTER TABLE public.notion_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notion_connections_select_admin" ON public.notion_connections
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "notion_connections_insert_admin" ON public.notion_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "notion_connections_update_admin" ON public.notion_connections
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "notion_connections_delete_admin" ON public.notion_connections
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TRIGGER update_notion_connections_updated_at
  BEFORE UPDATE ON public.notion_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crm_contacts ADD COLUMN IF NOT EXISTS notion_page_id text;