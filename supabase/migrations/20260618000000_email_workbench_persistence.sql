-- Email Workbench persistence (Phase 1)
--   * domain_lookups / hash_lookups : referenced everywhere but never created
--   * email_verdicts extensions     : encrypted-.eml pointer + non-PII IOCs + case link
--   * email-artifacts storage bucket : private, holds AES-GCM ciphertext only

-- ---------- domain_lookups / hash_lookups (mirror ip_lookups) ----------
create table if not exists domain_lookups (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  results jsonb default '{}'::jsonb,
  threat_score integer default 0,
  sources_checked text[] default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_domain_lookups_domain on domain_lookups(domain);
create index if not exists idx_domain_lookups_created on domain_lookups(created_at desc);

create table if not exists hash_lookups (
  id uuid primary key default gen_random_uuid(),
  hash text not null,
  results jsonb default '{}'::jsonb,
  threat_score integer default 0,
  sources_checked text[] default '{}',
  created_at timestamptz default now()
);
create index if not exists idx_hash_lookups_hash on hash_lookups(hash);
create index if not exists idx_hash_lookups_created on hash_lookups(created_at desc);

alter table domain_lookups enable row level security;
alter table hash_lookups enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='domain_lookups' and policyname='Authenticated can read domain lookups') then
    create policy "Authenticated can read domain lookups" on domain_lookups for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='domain_lookups' and policyname='Service role writes domain lookups') then
    create policy "Service role writes domain lookups" on domain_lookups for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='hash_lookups' and policyname='Authenticated can read hash lookups') then
    create policy "Authenticated can read hash lookups" on hash_lookups for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='hash_lookups' and policyname='Service role writes hash lookups') then
    create policy "Service role writes hash lookups" on hash_lookups for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---------- email_verdicts extensions ----------
-- Encrypted .eml lives in storage (storage_path) under AES-GCM (enc_iv); only
-- non-PII attacker IOCs are persisted in extracted_iocs. Victim/student PII stays
-- exclusively inside the encrypted blob.
alter table email_verdicts add column if not exists storage_path text;
alter table email_verdicts add column if not exists enc_iv text;
alter table email_verdicts add column if not exists eml_sha256 text;
alter table email_verdicts add column if not exists extracted_iocs jsonb not null default '[]'::jsonb;
alter table email_verdicts add column if not exists case_id uuid references case_notes(id) on delete set null;
create index if not exists idx_email_verdicts_eml_sha256 on email_verdicts(eml_sha256);
create index if not exists idx_email_verdicts_from_address on email_verdicts(from_address);

-- ---------- private storage bucket for encrypted artifacts ----------
-- Private (public=false). No object-level policies => only the service role
-- (store-email / read-email edge functions) can read/write. Clients never touch
-- the bucket directly; decryption is server-side only.
insert into storage.buckets (id, name, public)
values ('email-artifacts', 'email-artifacts', false)
on conflict (id) do nothing;
