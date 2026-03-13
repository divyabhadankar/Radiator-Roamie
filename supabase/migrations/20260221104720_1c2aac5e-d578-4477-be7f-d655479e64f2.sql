-- Drop the restrictive INSERT policy and recreate as permissive
DROP POLICY IF EXISTS "Auth users can create trips" ON public.trips;

CREATE POLICY "Auth users can create trips"
ON public.trips
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = organizer_id);