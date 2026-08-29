CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id uuid;
  display_name text;
  inv record;
BEGIN
  display_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'Personal');

  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, display_name, NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- If this email was invited to an existing organization, join it instead of
  -- creating a separate personal workspace.
  SELECT i.* INTO inv
  FROM public.organization_invites i
  WHERE lower(i.invited_email) = lower(NEW.email)
    AND i.accepted_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF inv.id IS NOT NULL THEN
    INSERT INTO public.organization_members (org_id, user_id, role, custom_role_id)
    VALUES (
      inv.org_id,
      NEW.id,
      inv.role,
      CASE WHEN inv.role IN ('member'::public.org_role, 'viewer'::public.org_role) THEN inv.custom_role_id ELSE NULL END
    )
    ON CONFLICT (org_id, user_id) DO NOTHING;

    UPDATE public.organization_invites
       SET accepted_at = now(), accepted_by = NEW.id
     WHERE id = inv.id;

    UPDATE public.profiles SET active_org_id = inv.org_id WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.organizations (name, created_by)
  VALUES (display_name || ' Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  UPDATE public.profiles SET active_org_id = new_org_id WHERE id = NEW.id;

  RETURN NEW;
END $function$;