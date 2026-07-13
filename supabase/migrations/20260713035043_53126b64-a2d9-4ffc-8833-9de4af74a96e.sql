
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS invoice_prefix text,
  ADD COLUMN IF NOT EXISTS invoice_footer text,
  ADD COLUMN IF NOT EXISTS default_vat_rate numeric(5,2);
