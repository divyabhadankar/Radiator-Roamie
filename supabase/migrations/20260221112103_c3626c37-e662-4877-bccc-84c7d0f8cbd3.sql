
-- =============================================
-- 1. TRIP INVITATIONS (shareable invite links)
-- =============================================

CREATE TABLE public.trip_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  max_uses integer DEFAULT NULL,
  uses integer NOT NULL DEFAULT 0,
  expires_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view trip invites"
  ON public.trip_invites FOR SELECT
  USING (is_trip_member(trip_id));

CREATE POLICY "Organizer can create invites"
  ON public.trip_invites FOR INSERT
  WITH CHECK (is_trip_organizer(trip_id));

CREATE POLICY "Organizer can delete invites"
  ON public.trip_invites FOR DELETE
  USING (is_trip_organizer(trip_id));

-- Join requests table (when someone uses an invite link)
CREATE TABLE public.trip_join_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invite_id uuid REFERENCES public.trip_invites(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone DEFAULT NULL,
  UNIQUE(trip_id, user_id)
);

ALTER TABLE public.trip_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests"
  ON public.trip_join_requests FOR SELECT
  USING (auth.uid() = user_id OR is_trip_member(trip_id));

CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Organizer can update requests"
  ON public.trip_join_requests FOR UPDATE
  USING (is_trip_organizer(trip_id));

-- =============================================
-- 2. COMMUNITY GROUPS
-- =============================================

CREATE TABLE public.communities (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  cover_image text,
  category text NOT NULL DEFAULT 'general',
  created_by uuid NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view public communities
CREATE POLICY "Anyone can view public communities"
  ON public.communities FOR SELECT
  USING (is_public = true);

CREATE POLICY "Auth users can create communities"
  ON public.communities FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update community"
  ON public.communities FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete community"
  ON public.communities FOR DELETE
  USING (auth.uid() = created_by);

-- Community memberships
CREATE TABLE public.community_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(community_id, user_id)
);

ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;

-- Helper function
CREATE OR REPLACE FUNCTION public.is_community_member(p_community_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.community_memberships
    WHERE community_id = p_community_id AND user_id = auth.uid()
  );
END;
$$;

CREATE POLICY "Anyone can view community members"
  ON public.community_memberships FOR SELECT
  USING (true);

CREATE POLICY "Users can join communities"
  ON public.community_memberships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave communities"
  ON public.community_memberships FOR DELETE
  USING (auth.uid() = user_id);

-- Community messages (group chat)
CREATE TABLE public.community_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view community messages"
  ON public.community_messages FOR SELECT
  USING (is_community_member(community_id));

CREATE POLICY "Members can send community messages"
  ON public.community_messages FOR INSERT
  WITH CHECK (is_community_member(community_id) AND auth.uid() = sender_id);

-- Community events
CREATE TABLE public.community_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  destination text,
  event_date timestamp with time zone NOT NULL,
  created_by uuid NOT NULL,
  max_attendees integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view events"
  ON public.community_events FOR SELECT
  USING (is_community_member(community_id));

CREATE POLICY "Members can create events"
  ON public.community_events FOR INSERT
  WITH CHECK (is_community_member(community_id) AND auth.uid() = created_by);

CREATE POLICY "Creator can update events"
  ON public.community_events FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete events"
  ON public.community_events FOR DELETE
  USING (auth.uid() = created_by);

-- Event RSVPs
CREATE TABLE public.event_rsvps (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'going',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view RSVPs"
  ON public.event_rsvps FOR SELECT
  USING (true);

CREATE POLICY "Users can RSVP"
  ON public.event_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own RSVP"
  ON public.event_rsvps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own RSVP"
  ON public.event_rsvps FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update member count
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = member_count - 1 WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
END;
$$;

CREATE TRIGGER trg_update_community_member_count
AFTER INSERT OR DELETE ON public.community_memberships
FOR EACH ROW
EXECUTE FUNCTION public.update_community_member_count();

-- Auto-add creator as admin member
CREATE OR REPLACE FUNCTION public.auto_add_community_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.community_memberships (community_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_community_creator
AFTER INSERT ON public.communities
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_community_creator();

-- Enable realtime for community messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_join_requests;
