-- The "Add team" form can create a missing Summer semester before adding its
-- first team. The browser needs an explicit RLS policy for that insert.
--
-- If the app later requires sign-in, replace `anon, authenticated` with the
-- appropriate administrator role and a narrower check.
create policy "timeline browser can create semesters"
  on public.semesters
  as permissive
  for insert
  to anon, authenticated
  with check (true);
