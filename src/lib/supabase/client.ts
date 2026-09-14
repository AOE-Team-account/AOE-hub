import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseAnonKey } from "./config";

// For use in Client Components. Reads/writes the session via cookies
// automatically so a server render can see the same session.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
