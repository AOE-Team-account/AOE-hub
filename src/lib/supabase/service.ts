import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Service-role client: bypasses Row Level Security entirely. Only for
// trusted server-side jobs with no associated user request (e.g. the
// pending-scan follow-up cron) — never import this into anything that
// could end up in a client bundle, and never use it just to avoid writing
// a proper RLS policy.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

export function createServiceRoleClient() {
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
