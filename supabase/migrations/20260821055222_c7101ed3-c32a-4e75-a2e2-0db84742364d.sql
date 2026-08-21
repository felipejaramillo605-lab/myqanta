ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_skipped boolean NOT NULL DEFAULT false;