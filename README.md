# AOEhub

**Alpha Omega Education** — a free education hub for homeschool, unschool, and school families. Domain: `aoe.ai`.

This is the real Next.js codebase, scaffolded around [`hub-prototype.html`](./hub-prototype.html) (the authoritative visual/interaction reference) and [`AOEhub memory from chat.md`](./AOEhub%20memory%20from%20chat.md) (the authoritative product/architecture decisions). Read both before making product decisions that aren't obvious from the code.

## Status: Phase 2 — Backend (schema + auth + real data, done)

The hub is now fully wired to a real Supabase backend — no mock data left anywhere in the app (`mock-data.ts` has been deleted). It genuinely launches empty: every board, list, and dashboard reflects whatever is actually in your database.

| Concern | Status | Where it lives |
|---|---|---|
| Auth / sessions | **Real** — Supabase Auth (email + password) | `src/contexts/AuthContext.tsx`, `src/app/login`, `src/app/signup` |
| Database schema | **Real**, live-tested end to end | `supabase/schema.sql` |
| pgvector (for RAG) | **Enabled** in schema, tables created, unused until Phase 6 | `supabase/schema.sql` (`kb_documents`, `kb_chunks`) |
| Points | **Real formula**, server-enforced via triggers/functions | `supabase/schema.sql` (`award_points`, `record_view`), `src/lib/points.ts` |
| Everything you can browse (both boards, Groups, Admin Dashboard, notifications, your own profile) | **Real queries and real writes** — posting, commenting, joining/creating/leaving groups all hit Supabase | `src/lib/data/*.ts`, plus direct browser-client calls in each page (see below) |
| File *uploads* specifically | Form UI only, no real insert yet — needs real file storage first | `src/app/files/new/page.tsx` → Phase 3 |
| File downloads | Fake buttons | `src/components/files/FileDetailActions.tsx` → Phase 3 |
| RAG AI assistant | Keyword placeholder, behind a swappable interface | `src/lib/ai/keyword-provider.ts` → Phase 6 |
| Content translation | Seeded cache, no real API call | `src/lib/i18n/translate.ts` → Phase 8 |

**Two patterns for real data, by design:** server-rendered pages (detail pages, board list pages) fetch through `src/lib/data/*.ts` using the server Supabase client. Write actions (posting, commenting, joining a group) call the *browser* Supabase client directly from a Client Component, then call `router.refresh()` — Row Level Security enforces who's allowed to do what either way, so this split is about which client is convenient, not about security.

**Known gap:** `profiles.groups_count`, `files_count`, `followers_count`, and `following_count` are denormalized columns that exist in the schema but aren't yet kept up to date by triggers (only `points` has that, via `award_points()`). The Profile page works around this for its own files count by counting real rows directly; the other three will show stale/zero values until that's built.

## Setting up your own Supabase project

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. In the dashboard, go to **SQL Editor → New query**, paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql), and run it. This creates every table, the points-awarding functions/triggers, RLS policies, and enables `pgvector`.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (secret — server-only, never in browser code) → `SUPABASE_SERVICE_ROLE_KEY`
4. Copy `.env.example` to `.env.local` and fill in those three values. `.env.local` is gitignored — never commit real keys.
5. (Optional, for easier local testing) In **Authentication → Sign In / Providers → Email**, turn off "Confirm email" so signing up logs you straight in without needing to click an email link.
6. To make yourself an admin for testing the Admin Dashboard: sign up normally, then in **Table Editor → profiles**, set your row's `is_admin` to `true`.

Without a `.env.local`, the app still builds and runs — auth and real-data pages just won't function (guest browsing and the still-mock pages work regardless).

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Structure

```
src/
  app/                    routes (App Router) — one folder per page in hub-prototype.html
    login/, signup/        real Supabase auth forms
    experience/, files/, groups/, admin/   each has a Server Component page.tsx (real data fetch)
                                            + a *Client.tsx sibling (interactivity, real writes)
  components/
    layout/               TopBar, PrimaryTabs, AppShell, SignInModal, ReportModal
    ai/                   the draggable AI chat FAB
    ui/                   design-system primitives (Card, Chip, Badge, Button, Modal, ...)
    discussion/           shared comment-thread UI (used by both boards, real inserts)
    files/, profile/, brand/   feature-specific small components
  contexts/               AuthContext (real Supabase session), ThemeContext, LanguageContext, ReportContext
  lib/
    types.ts              core domain types — the Postgres schema mirrors these closely
    data/                  data-access layer (server client) — reads for every list/detail page
    supabase/              browser/server Supabase clients (client.ts, server.ts, config.ts)
    profile.ts              maps a `profiles` row to the app's `User` type
    theme-presets.ts        the 15 alternate themes, ported verbatim from the prototype
    fonts.ts                next/font setup for every font the themes reference
    points.ts               the points formula (search-ranking compression only — DB does the raw counting)
    ai/                      swappable AI provider interface + placeholder implementation
    i18n/                    UI dictionary (en/zh-CN/zh-TW) + on-demand content translation
  proxy.ts                  refreshes the Supabase session on every request (Next 16 renamed "middleware")
supabase/
  schema.sql                run this once in the Supabase SQL Editor — see setup steps above
```

## Design system

Colors, spacing, and component classes (`.card`, `.chip`, `.badge`, `.pin`, etc.) are ported directly from the prototype's `<style>` block into `src/app/globals.css` as plain CSS driven by custom properties — per the project memory, these are already fully specified and shouldn't be re-derived. Tailwind is installed (for base resets) but isn't the primary styling mechanism here; that's a deliberate fidelity choice, not an oversight.

Theme switching (Settings → Appearance) works by having `ThemeContext` set those same custom properties at runtime — see `src/contexts/ThemeContext.tsx`.

One accessibility detail worth knowing before touching layout: the text-size control applies CSS `zoom` to a wrapper around top bar + tabs + page content only (see `AppShell.tsx`), never to the whole app shell — `zoom` changes the containing-block behavior of `position: fixed` descendants, which would misposition the AI chat FAB and modals if it were applied higher up.

## What's next (per the roadmap in the memory doc)

1. ~~Code foundation~~
2. Backend — real Supabase project, schema, pgvector, real auth, all boards/dashboard on real data ← **you are here** (done, except real file uploads/downloads — that needs Phase 3's storage)
3. File storage — Cloudflare R2 + Internet Archive, real upload flow
4. Hosting & domain — Cloudflare Pages, then `aoe.ai` DNS
5. Backups — scheduled `pg_dump` to Backblaze B2 (set up before RAG so the safety net exists before more complex data starts accumulating)
6. RAG AI — real embedding pipeline behind the existing `AIProvider` interface
7. Populate content — admins upload the real first-wave content
8. Marketing copy & translation — final wording, real translation API
9. Launch
