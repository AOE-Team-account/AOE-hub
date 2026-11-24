-- AOE-SEC-01: uploads are sealed before the virus scan.
-- Adds the column that remembers the sealed copy's fingerprint (ETag).
-- Safe to run more than once. Run BEFORE deploying the new hub code.
alter table public.file_assets add column if not exists staged_etag text;
