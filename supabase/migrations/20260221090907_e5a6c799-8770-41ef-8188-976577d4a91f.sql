
-- Auto-add organizer as a trip member when a trip is created
CREATE OR REPLACE FUNCTION public.auto_add_organizer_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trip_memberships (trip_id, user_id, role)
  VALUES (NEW.id, NEW.organizer_id, 'organizer');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_organizer
AFTER INSERT ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_organizer_membership();
