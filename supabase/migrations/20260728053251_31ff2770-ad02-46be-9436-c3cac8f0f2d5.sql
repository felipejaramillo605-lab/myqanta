ALTER TABLE public.fin_accounts ADD COLUMN IF NOT EXISTS is_current boolean;

UPDATE public.fin_accounts
SET is_current = true
WHERE is_current IS NULL
  AND (code LIKE '11%' OR code LIKE '13%' OR code LIKE '14%'
       OR code LIKE '22%' OR code LIKE '23%' OR code LIKE '24%' OR code LIKE '25%');

UPDATE public.fin_accounts
SET is_current = false
WHERE is_current IS NULL AND code LIKE '15%';