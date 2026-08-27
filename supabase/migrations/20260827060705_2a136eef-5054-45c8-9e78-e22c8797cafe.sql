CREATE TABLE public.hr_resume_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  candidate_name text NOT NULL DEFAULT '',
  position_applied text,
  file_name text,
  score integer NOT NULL DEFAULT 0,
  recommendation text NOT NULL DEFAULT 'maybe',
  summary text NOT NULL DEFAULT '',
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_years numeric NOT NULL DEFAULT 0,
  email text,
  phone text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hr_resume_reviews_org_created_idx ON public.hr_resume_reviews (org_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_resume_reviews TO authenticated;
GRANT ALL ON public.hr_resume_reviews TO service_role;

ALTER TABLE public.hr_resume_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_resume_reviews_select_member" ON public.hr_resume_reviews
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id, auth.uid()));

CREATE POLICY "hr_resume_reviews_insert_writer" ON public.hr_resume_reviews
  FOR INSERT TO authenticated
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE POLICY "hr_resume_reviews_update_writer" ON public.hr_resume_reviews
  FOR UPDATE TO authenticated
  USING (public.can_write_org(org_id, auth.uid()))
  WITH CHECK (public.can_write_org(org_id, auth.uid()));

CREATE POLICY "hr_resume_reviews_delete_admin" ON public.hr_resume_reviews
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TRIGGER update_hr_resume_reviews_updated_at
  BEFORE UPDATE ON public.hr_resume_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();