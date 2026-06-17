-- Make .eml dedup race-safe: a UNIQUE constraint backstops store-email's
-- check-then-insert (two concurrent saves of the same message can otherwise both
-- pass the pre-check). Postgres treats NULLs as distinct, so verdict-only rows
-- (no eml_sha256) are unaffected.
alter table email_verdicts add constraint email_verdicts_eml_sha256_key unique (eml_sha256);
