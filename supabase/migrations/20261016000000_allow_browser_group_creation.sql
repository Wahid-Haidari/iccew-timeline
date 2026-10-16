-- The timeline is currently edited directly from the browser using the
-- Supabase publishable key. Reads are already permitted, but inserts into
-- public.groups have no matching RLS policy, which causes Postgres error
-- 42501 when the "Add team" form is submitted.
--
-- This application intentionally permits anyone who can open the timeline to
-- add a group. If the app gains sign-in, replace `anon, authenticated` with
-- the appropriate authenticated administrator role and a narrower check.
create policy "timeline browser can create groups"
  on public.groups
  as permissive
  for insert
  to anon, authenticated
  with check (true);
