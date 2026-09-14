# AOEhub

**Alpha Omega Education** — a free education hub for homeschool, unschool, and school families. Domain: `aoe.ai`.

This is the real Next.js codebase, scaffolded around [`hub-prototype.html`](./hub-prototype.html) (the authoritative visual/interaction reference) and [`AOEhub memory from chat.md`](./AOEhub%20memory%20from%20chat.md) (the authoritative product/architecture decisions). Read both before making product decisions that aren't obvious from the code.

## Status: Phase 2 — Backend (in progress)

| Concern | Status | Where it lives |
|---|---|---|
| Auth / sessions | **Real** — Supabase Auth (email + password) | `src/contexts/AuthContext.tsx`, `src/app/login`, `src/app/signup` |
| Database schema | **Real** — full schema, ready to run | `supabase/schema.sql` |
| pgvector (for RAG) | **Enabled** in schema, tables created, unused until Phase 6 | `supabase/schema.sql` (`kb_documents`, `kb_chunks`) |
| Points | **Real formula**, server-enforced via triggers/functions | `supabase/schema.sql` (`award_points`, `record_view`, `record_download`), `src/lib/points.ts` |
| File Board / Experience Board detail pages, public profile | **Real queries** | `src/lib/data/*.ts` → Supabase |
| File Board / Experience Board / Groups / Admin **list views**, notifications | **Still mock** — not yet migrated off `mock-data.ts` | `src/app/experience/page.tsx`, `src/app/files/page.tsx`, `src/app/groups/page.tsx`, `src/app/admin/page.tsx`, `src/components/layout/TopBar.tsx`, `src/app/profile/page.tsx` |
| File storage / downloads | Fake buttons | `src/components/files/FileDetailActions.tsx` → Phase 3 |
| RAG AI assistant | Keyword placeholder, behind a swappable interface | `src/lib/ai/keyword-provider.ts` → Phase 6 |
| Content translation | Seeded cache, no real API call | `src/lib/i18n/translate.ts` → Phase 8 |

**Why the list views are still mock:** those pages read `mock-data.ts` directly rather than going through `src/lib/data/*.ts` (a deliberate Phase 1 split — client-interactive board pages vs. server-rendered detail pages). Wiring them to real Supabase queries is the natural next chunk of Phase 2 work.

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
  components/
    layout/               TopBar, PrimaryTabs, AppShell, SignInModal, ReportModal
    ai/                   the draggable AI chat FAB
    ui/                   design-system primitives (Card, Chip, Badge, Button, Modal, ...)
    discussion/           shared comment-thread UI (used by both boards)
    files/, profile/, brand/   feature-specific small components
  contexts/               AuthContext (real Supabase session), ThemeContext, LanguageContext, ReportContext
  lib/
    types.ts              core domain types — the Postgres schema mirrors these closely
    mock-data.ts           in-memory sample content — still used by board LIST pages, see table above
    data/                  data-access layer — detail pages + profile queries go through here to Supabase
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
2. Backend — real Supabase project, schema, pgvector, real auth ← **you are here** (schema + auth done; board list pages still need migrating off mock data)
3. File storage — Cloudflare R2 + Internet Archive, real upload flow
4. Hosting & domain — Cloudflare Pages, then `aoe.ai` DNS
5. Backups — scheduled `pg_dump` to Backblaze B2 (set up before RAG so the safety net exists before more complex data starts accumulating)
6. RAG AI — real embedding pipeline behind the existing `AIProvider` interface
7. Populate content — admins upload the real first-wave content
8. Marketing copy & translation — final wording, real translation API
9. Launch
