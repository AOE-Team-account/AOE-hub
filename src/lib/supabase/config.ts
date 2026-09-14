// Falls back to harmless placeholders when real credentials aren't set yet
// (before the Supabase project exists, or in CI) so `next build` and static
// prerendering never hard-crash just because .env.local is missing — same
// "buildable before the backend is real" principle Phase 1 used for the
// mock data layer. Any actual network call made with the placeholder still
// fails at request time, which is expected and fine pre-Phase-2-setup.

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";
