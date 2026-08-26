CREATE TABLE public.obsidian_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  base_url text NOT NULL,
  api_key_encrypted text NOT NULL,
  vault_name text,
  folder text NOT NULL DEFAULT 'Qanta',
  connected_by uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obsidian_connections TO authenticated;
GRANT ALL ON public.obsidian_connections TO service_role;

ALTER TABLE public.obsidian_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "obsidian_connections_select_admin" ON public.obsidian_connections
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "obsidian_connections_insert_admin" ON public.obsidian_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "obsidian_connections_update_admin" ON public.obsidian_connections
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "obsidian_connections_delete_admin" ON public.obsidian_connections
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TRIGGER update_obsidian_connections_updated_at
  BEFORE UPDATE ON public.obsidian_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();