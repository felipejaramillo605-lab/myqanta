ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'CO';

CREATE TABLE IF NOT EXISTS public.public_holidays_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code text NOT NULL,
  year integer NOT NULL,
  holiday_date date NOT NULL,
  name text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, year, holiday_date)
);

GRANT SELECT ON public.public_holidays_cache TO authenticated;
GRANT ALL ON public.public_holidays_cache TO service_role;

ALTER TABLE public.public_holidays_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read holidays"
  ON public.public_holidays_cache FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_public_holidays_cache_lookup
  ON public.public_holidays_cache (country_code, year);