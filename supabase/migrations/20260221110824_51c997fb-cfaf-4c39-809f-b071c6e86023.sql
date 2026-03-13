
CREATE OR REPLACE FUNCTION public.auto_add_organizer_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.trip_memberships (trip_id, user_id, role)
  VALUES (NEW.id, NEW.organizer_id, 'organizer')
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
