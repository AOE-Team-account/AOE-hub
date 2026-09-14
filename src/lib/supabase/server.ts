import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey } from "./config";

// For use in Server Components, Server Actions, and Route Handlers. Create
// a new one per request — never share/cache an instance across requests.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component during render, where cookies
            // can't be written — harmless as long as proxy.ts (below) is
            // also refreshing the session on every request.
          }
        },
      },
    }
  );
}
