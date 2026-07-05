DO $$ BEGIN
  CREATE TYPE public.reminder_recurrence AS ENUM ('none','daily','weekly','monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS recurrence public.reminder_recurrence NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_interval integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recurrence_until timestamptz,
  ADD COLUMN IF NOT EXISTS parent_reminder_id uuid REFERENCES public.reminders(id) ON DELETE SET NULL;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_recurrence_interval_positive
  CHECK (recurrence_interval >= 1 AND recurrence_interval <= 365);
