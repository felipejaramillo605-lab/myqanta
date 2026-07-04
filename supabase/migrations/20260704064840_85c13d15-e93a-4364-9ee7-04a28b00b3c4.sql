
CREATE TABLE public.whatsapp_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_e164 text,
  enabled boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'mock',
  default_lead_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.whatsapp_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TYPE public.reminder_source AS ENUM ('task','habit','event','custom');
CREATE TYPE public.reminder_status AS ENUM ('pending','sent','failed','cancelled');

CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type public.reminder_source NOT NULL DEFAULT 'custom',
  source_id uuid,
  title text NOT NULL,
  message text NOT NULL,
  phone_e164 text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status public.reminder_status NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  provider text NOT NULL DEFAULT 'mock',
  provider_message_id text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_due_idx ON public.reminders (status, scheduled_at);
CREATE INDEX reminders_user_idx ON public.reminders (user_id, scheduled_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own reminders" ON public.reminders FOR SELECT
  USING (auth.uid() = user_id OR public.is_org_member(org_id, auth.uid()));
CREATE POLICY "insert own reminders" ON public.reminders FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.is_org_member(org_id, auth.uid()));
CREATE POLICY "update own reminders" ON public.reminders FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own reminders" ON public.reminders FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER reminders_touch BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER whatsapp_settings_touch BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
