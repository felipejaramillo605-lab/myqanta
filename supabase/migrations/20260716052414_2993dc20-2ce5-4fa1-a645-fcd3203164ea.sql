
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS approvers_by_module jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS vat_responsible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ica_responsible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ica_rate numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_retentions text;
