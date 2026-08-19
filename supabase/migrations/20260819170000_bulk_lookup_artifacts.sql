-- Bulk Lookup: stop discarding per-IP scan evidence.
--
-- Previously /bulk computed a full ip_lookups-shaped aggregate per IP (raw
-- source results, enrichment, calibrated scoring) and then only returned a
-- thin summary to the client — the full evidence was never persisted, and
-- clicking "Full scan" re-ran the entire /ip pipeline from scratch instead
-- of reusing what bulk had already computed.
--
-- This adds a batch_id to ip_lookups so every IP scanned in one bulk request
-- shares a batch identifier, and each row's returned id becomes a durable
-- "artifact id" the UI can hand to a cheap "open report" read (no external
-- calls) or a "deep enrich" call (adds the ~11 sources bulk skips).

alter table ip_lookups add column if not exists batch_id uuid;

create index if not exists idx_ip_lookups_batch_id on ip_lookups(batch_id) where batch_id is not null;
