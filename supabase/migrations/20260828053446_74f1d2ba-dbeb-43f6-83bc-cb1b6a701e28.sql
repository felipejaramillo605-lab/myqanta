CREATE TABLE public.fx_rate_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate_date DATE NOT NULL,
  rate NUMERIC NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (from_currency, to_currency, rate_date)
);

GRANT SELECT, INSERT, UPDATE ON public.fx_rate_cache TO authenticated;
GRANT ALL ON public.fx_rate_cache TO service_role;

ALTER TABLE public.fx_rate_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read fx rates"
ON public.fx_rate_cache FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can cache fx rates"
ON public.fx_rate_cache FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can refresh fx rates"
ON public.fx_rate_cache FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_fx_rate_cache_updated_at
BEFORE UPDATE ON public.fx_rate_cache
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();