-- The browser never accesses PostgREST directly; all database access goes through
-- the authenticated Express/Prisma backend. Enable RLS on every exposed table and
-- intentionally add no client-facing policies. The database owner used by Prisma
-- continues to work (it bypasses RLS), while anon/authenticated Supabase API roles
-- receive no rows and cannot mutate data.
--
-- Do not add broad `USING (true)` policies here. If direct Supabase client access
-- is introduced later, add narrowly scoped policies based on Supabase Auth first.

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alias_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reveal_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
