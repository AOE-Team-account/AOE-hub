-- AOE-SEC-25: visitors and members may read only the display columns of a file
-- record. Where a file is stored (storage_path, staging_key, final_key,
-- final_backend, game_prefix, multipart_upload_id, staged_etag, scan details,
-- original_name) is read only by the hub's server (service_role).
-- Apply TOGETHER WITH the new app code: the old download route read storage_path
-- with the member's own key and stops working once this runs.
-- Safe to run more than once. Mirrors the end of supabase/schema.sql.

revoke select on public.file_assets from anon, authenticated;
grant select (id, file_post_id, label, mime_type, downloads, scan_status, created_at,
              size_bytes, is_link, link_url, link_host, is_game)
  on public.file_assets to anon, authenticated;

-- Check (expect: f for anon on final_key, t for anon on label):
-- select has_column_privilege('anon', 'public.file_assets', 'final_key', 'select'),
--        has_column_privilege('anon', 'public.file_assets', 'label', 'select');
