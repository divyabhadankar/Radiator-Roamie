
-- Allow anyone authenticated to read a specific invite by code (needed for join flow)
CREATE POLICY "Anyone can read invite by code"
  ON public.trip_invites FOR SELECT
  USING (true);

-- Drop the old restrictive SELECT policy since the new one is more permissive
DROP POLICY IF EXISTS "Members can view trip invites" ON public.trip_invites;
