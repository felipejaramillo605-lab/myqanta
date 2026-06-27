
-- =========================
-- ROLES
-- =========================
CREATE TYPE public.app_role AS ENUM ('user', 'admin_manager');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security-definer
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin_manager'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_manager'));

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'es',
  preferred_mode TEXT NOT NULL DEFAULT 'dark',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- THEME SETTINGS (global, singleton)
-- =========================
CREATE TABLE public.theme_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- colors stored as oklch strings, e.g. "oklch(0.62 0.19 256)"
  primary_color TEXT NOT NULL DEFAULT 'oklch(0.72 0.17 162)',
  secondary_color TEXT NOT NULL DEFAULT 'oklch(0.55 0.02 260)',
  accent_color TEXT NOT NULL DEFAULT 'oklch(0.72 0.17 162)',
  background_dark TEXT NOT NULL DEFAULT 'oklch(0.14 0.01 260)',
  background_light TEXT NOT NULL DEFAULT 'oklch(0.99 0.005 260)',
  foreground_dark TEXT NOT NULL DEFAULT 'oklch(0.97 0.005 260)',
  foreground_light TEXT NOT NULL DEFAULT 'oklch(0.18 0.02 260)',
  destructive_color TEXT NOT NULL DEFAULT 'oklch(0.55 0.18 25)',
  positive_color TEXT NOT NULL DEFAULT 'oklch(0.72 0.17 162)',
  font_sans TEXT NOT NULL DEFAULT 'Inter, ui-sans-serif, system-ui, sans-serif',
  font_mono TEXT NOT NULL DEFAULT '"JetBrains Mono", ui-monospace, monospace',
  radius_rem NUMERIC NOT NULL DEFAULT 0.75,
  default_mode TEXT NOT NULL DEFAULT 'dark',
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.theme_settings TO anon, authenticated;
GRANT INSERT, UPDATE ON public.theme_settings TO authenticated;
GRANT ALL ON public.theme_settings TO service_role;

ALTER TABLE public.theme_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read theme"
  ON public.theme_settings FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert theme"
  ON public.theme_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin_manager'));

CREATE POLICY "Admins can update theme"
  ON public.theme_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin_manager'));

CREATE TRIGGER update_theme_settings_updated_at
  BEFORE UPDATE ON public.theme_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial theme row
INSERT INTO public.theme_settings DEFAULT VALUES;
