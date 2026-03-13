-- Allow trip members to view profiles of other trip members
CREATE POLICY "Trip members can view co-member profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_memberships tm1
    JOIN public.trip_memberships tm2 ON tm1.trip_id = tm2.trip_id
    WHERE tm1.user_id = auth.uid() AND tm2.user_id = profiles.id
  )
);

-- Allow viewing profiles for join request resolution
CREATE POLICY "Organizers can view requester profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.trip_join_requests tjr
    JOIN public.trips t ON tjr.trip_id = t.id
    WHERE tjr.user_id = profiles.id AND t.organizer_id = auth.uid()
  )
);