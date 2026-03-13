-- Recreate the function to auto-add organizer to trip_memberships
CREATE OR REPLACE FUNCTION public.auto_add_organizer_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.trip_memberships (trip_id, user_id, role)
  VALUES (NEW.id, NEW.organizer_id, 'organizer');
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS trg_auto_add_organizer ON public.trips;

CREATE TRIGGER trg_auto_add_organizer
AFTER INSERT ON public.trips
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_organizer_membership();

-- Also ensure the trip_memberships INSERT policy allows the trigger (runs as SECURITY DEFINER, so this is fine)
-- But let's also add a permissive self-insert policy for safety
DROP POLICY IF EXISTS "Users can add own membership" ON public.trip_memberships;
CREATE POLICY "Users can add own membership"
ON public.trip_memberships
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);