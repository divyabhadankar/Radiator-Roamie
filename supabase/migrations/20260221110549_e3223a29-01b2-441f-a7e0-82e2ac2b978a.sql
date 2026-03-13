
-- Add status column to activities for marking
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Create activity_votes table for voting system
CREATE TABLE public.activity_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL CHECK (vote IN ('up', 'down')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

-- Enable RLS on votes
ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;

-- Votes policies: members of the trip can CRUD votes
CREATE OR REPLACE FUNCTION public.get_trip_id_from_vote(p_activity_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.trip_id 
  FROM public.activities a 
  JOIN public.itineraries i ON a.itinerary_id = i.id 
  WHERE a.id = p_activity_id;
$$;

CREATE POLICY "Members can view votes"
ON public.activity_votes FOR SELECT
USING (is_trip_member(get_trip_id_from_vote(activity_id)));

CREATE POLICY "Members can insert votes"
ON public.activity_votes FOR INSERT
WITH CHECK (is_trip_member(get_trip_id_from_vote(activity_id)) AND auth.uid() = user_id);

CREATE POLICY "Members can update own votes"
ON public.activity_votes FOR UPDATE
USING (auth.uid() = user_id AND is_trip_member(get_trip_id_from_vote(activity_id)));

CREATE POLICY "Members can delete own votes"
ON public.activity_votes FOR DELETE
USING (auth.uid() = user_id AND is_trip_member(get_trip_id_from_vote(activity_id)));

-- Enable realtime for votes and activities for live collab
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_votes;
