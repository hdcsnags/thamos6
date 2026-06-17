-- Audit follow-up: remove anonymous (public anon-key) access from investigation
-- and scan-history tables. These should require a logged-in user. The shared-team
-- model is preserved (USING (true) for authenticated). Reference tables
-- (tor_exit_nodes / vpn_providers / tranco_*) intentionally keep public read.
--
-- Safe for the app: every client query runs while authenticated, so it uses the
-- `authenticated` role. Inserts are also done server-side via the service role,
-- which bypasses RLS entirely. Revert a policy by recreating it `TO anon,
-- authenticated` if a logged-out read path is discovered.

-- case_notes
drop policy if exists "Anyone can view case notes" on case_notes;
create policy "Authenticated can view case notes"
  on case_notes for select to authenticated using (true);

drop policy if exists "Anyone can create case notes" on case_notes;
create policy "Authenticated can create case notes"
  on case_notes for insert to authenticated with check (true);

-- ip_lookups
drop policy if exists "Public can read IP lookups" on ip_lookups;
create policy "Authenticated can read IP lookups"
  on ip_lookups for select to authenticated using (true);

drop policy if exists "Public can insert IP lookups" on ip_lookups;
create policy "Authenticated can insert IP lookups"
  on ip_lookups for insert to authenticated with check (true);

-- url_lookups
drop policy if exists "Public can read URL lookups" on url_lookups;
create policy "Authenticated can read URL lookups"
  on url_lookups for select to authenticated using (true);

drop policy if exists "Public can insert URL lookups" on url_lookups;
create policy "Authenticated can insert URL lookups"
  on url_lookups for insert to authenticated with check (true);
