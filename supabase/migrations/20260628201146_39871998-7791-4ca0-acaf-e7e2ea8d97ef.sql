ALTER TABLE public.inv_movements ADD COLUMN IF NOT EXISTS expense_category text;
ALTER TABLE public.finance_transactions ADD COLUMN IF NOT EXISTS expense_category text;
CREATE INDEX IF NOT EXISTS inv_movements_expense_category_idx ON public.inv_movements(expense_category);
CREATE INDEX IF NOT EXISTS finance_transactions_expense_category_idx ON public.finance_transactions(expense_category);