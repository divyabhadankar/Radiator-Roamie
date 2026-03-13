-- Allow trip members to insert disruption events
CREATE POLICY "Members can insert disruption events"
ON public.disruption_events
FOR INSERT
WITH CHECK (is_trip_member(trip_id));
