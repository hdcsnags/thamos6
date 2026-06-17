-- Remediate Supabase Security Advisor findings (2026-06-17)
--   rls_disabled_in_public : public.tranco_rankings, public.tranco_list_metadata
--   security_definer_view  : public.admin_user_overview, public.victim_intelligence_summary

-- 1. Enable RLS on the two reference tables. The refresh job writes via the
--    service role (which bypasses RLS), so clients only ever need read access.
--    Matches the existing tor_exit_nodes / vpn_providers reference-table pattern.
alter table public.tranco_rankings      enable row level security;
alter table public.tranco_list_metadata enable row level security;

drop policy if exists "tranco_rankings_read" on public.tranco_rankings;
create policy "tranco_rankings_read"
  on public.tranco_rankings for select
  to anon, authenticated
  using (true);

drop policy if exists "tranco_list_metadata_read" on public.tranco_list_metadata;
create policy "tranco_list_metadata_read"
  on public.tranco_list_metadata for select
  to anon, authenticated
  using (true);
-- No insert/update/delete policies => only the service role can write.

-- 2. Make the two views run with the QUERYING user's permissions and RLS
--    instead of the view owner's (the SECURITY DEFINER default in Postgres).
--    profiles and usage_stats already carry "admins see all / users see own"
--    policies via is_admin(), so admin_user_overview stays correct for admins
--    while it STOPS leaking every user's row to any authenticated caller.
--    victim_intelligence_summary is aggregate threat-intel only (no per-user
--    data); invoker semantics simply honor the reader's table access.
alter view public.admin_user_overview         set (security_invoker = on);
alter view public.victim_intelligence_summary set (security_invoker = on);
