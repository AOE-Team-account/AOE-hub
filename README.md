# AOEhub

**Alpha Omega Education** — a free education hub for homeschool, unschool, and school families. Domain: `aoe.ai`.

This is the real Next.js codebase, scaffolded around [`hub-prototype.html`](./hub-prototype.html) (the authoritative visual/interaction reference) and the project's memory doc (the authoritative product/architecture decisions — currently `AOEhub memory from chat3.md`; the project owner edits this file directly between sessions and renames it as it grows, so check the folder for the current filename rather than trusting this link). Read both before making product decisions that aren't obvious from the code.

## Status: Phase 3 — File storage (done)

The hub is fully wired to real backends everywhere — no mock data anywhere in the app. It genuinely launches empty: every board, list, and dashboard reflects whatever is actually in your database and storage.

| Concern | Status | Where it lives |
|---|---|---|
| Auth / sessions | **Real** — Supabase Auth (email + password) | `src/contexts/AuthContext.tsx`, `src/app/login`, `src/app/signup` |
| Database schema | **Real**, live-tested end to end | `supabase/schema.sql` |
| pgvector (for RAG) | **Enabled** in schema, tables created, unused until Phase 6 | `supabase/schema.sql` (`kb_documents`, `kb_chunks`) |
| Points | **Real formula**, server-enforced via triggers/functions | `supabase/schema.sql` (`award_points`, `record_view`, `record_download`), `src/lib/points.ts` |
| Every board, Groups, Admin Dashboard, notifications, your own profile | **Real queries and real writes** | `src/lib/data/*.ts`, plus direct browser-client calls in each page |
| File uploads | **Real** — routes to Cloudflare R2 (small files) or Internet Archive (large files) automatically, gated by a real VirusTotal malware scan | `src/app/api/upload/route.ts`, `src/lib/storage/`, `src/lib/malware-scan/` |
| File downloads | **Real** — signed URL (R2) or direct IA URL, only for scan-confirmed-clean files; increments the download counter and awards points | `src/app/api/download/[assetId]/route.ts` |
| RAG AI assistant | Keyword placeholder, behind a swappable interface | `src/lib/ai/keyword-provider.ts` → Phase 6 |
| Content translation | Seeded cache, no real API call | `src/lib/i18n/translate.ts` → Phase 8 |

**Two patterns for real data, by design:** server-rendered pages (detail pages, board list pages) fetch through `src/lib/data/*.ts` using the server Supabase client. Write actions (posting, commenting, joining a group) call the *browser* Supabase client directly from a Client Component, then call `router.refresh()` — Row Level Security enforces who's allowed to do what either way, so this split is about which client is convenient, not about security. File uploads are the one write that goes through a server Route Handler instead (`/api/upload`), since the storage/scanning credentials are server-only secrets.

### How file uploads actually work

1. `/api/upload` uploads the file's bytes to storage **first** — Cloudflare R2 under 50MB, Internet Archive above that (`src/lib/storage/router.ts` — the threshold is a tunable constant, not a spec'd number from the project docs).
2. It submits the file to VirusTotal and polls briefly (~10s). A fast result (the common case for small/known files) marks the asset `clean` or `flagged` immediately.
3. If VirusTotal is still working after that short window — normal on their free tier, observed taking several minutes during testing — the asset is saved as `pending` with the VirusTotal analysis id attached. The file's bytes stay in storage but are invisible to everyone except the uploader/admins (RLS) and refused by the download route either way.
4. `/api/cron/check-pending-scans` (protected by `CRON_SECRET`) re-checks any `pending` asset once and resolves it: `clean` stays as-is, `flagged` gets its storage object deleted (real quarantine, not just a hidden row) and the row updated. **Not wired to an actual scheduler yet** — that's a Phase 4 hosting decision (Vercel Cron, Cloudflare Cron Triggers, or a timed GitHub Action all work); call it by hand or via any scheduler in the meantime.

**Known follow-ups, deliberately not built yet:**
- Files over 200MB are rejected — very large uploads would need a presigned direct-to-storage upload instead of routing bytes through this server, a bigger change than this pass needed.
- The "remix" authorship field is a free-text hint, not a real link to the original post yet — no search-and-select UI for it.
- The preview image/video picker on the upload form is still a placeholder — doesn't upload anything.
- `profiles.groups_count`, `files_count`, `followers_count`, `following_count` are denormalized columns not yet kept current by triggers (only `points` has that). The Profile page works around this for its own files count by counting real rows directly.

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

Without a `.env.local`, the app still builds and runs — auth and real-data pages just won't function (guest browsing works regardless).

## Setting up file storage + malware scanning

1. **Cloudflare R2**: create a free Cloudflare account → R2 Object Storage → create a bucket (Standard storage class — Infrequent Access is for rarely-touched data, wrong fit for a hub people actively download from) → R2 → Manage API tokens → create an **Account** token (not User) with Object Read & Write scoped to that one bucket, no expiry, no IP filtering (nothing in this stack has one fixed IP to filter to). You need the Account ID, Access Key ID, and Secret Access Key → `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME`.
2. **Internet Archive**: free account at [archive.org](https://archive.org) → once logged in, go to [archive.org/account/s3.php](https://archive.org/account/s3.php) for your Access Key / Secret Key → `IA_ACCESS_KEY` / `IA_SECRET_KEY` / `IA_BUCKET_NAME` (an IA "bucket" is really an "item," created automatically on first upload — nothing to create ahead of time). Note: brand-new IA items have a real propagation delay (observed several minutes during testing) before they're publicly downloadable — this is normal IA behavior, not a bug.
3. **VirusTotal**: free account at [virustotal.com](https://www.virustotal.com/gui/join-us) → profile icon → API Key → `VIRUSTOTAL_API_KEY`.
4. Generate a `CRON_SECRET` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) to protect the pending-scan follow-up endpoint.

See `.env.example` for the full list with inline notes.

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
    api/
      upload/               receives a file, scans it, routes it to storage
      download/[assetId]/   verifies scan_status="clean", redirects to a real signed/direct URL
      cron/check-pending-scans/   resolves scans VirusTotal didn't finish in time (see below)
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
    supabase/              browser/server/service-role Supabase clients (client.ts, server.ts, service.ts, config.ts)
    storage/                R2 + Internet Archive clients, size-based routing (router.ts)
    malware-scan/            VirusTotal submit/poll (virustotal.ts)
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
2. ~~Backend — real Supabase project, schema, pgvector, real auth, all boards/dashboard on real data~~
3. File storage — Cloudflare R2 + Internet Archive, real upload flow, VirusTotal scanning gate ← **you are here** (done — see "known follow-ups" above for what's deliberately left for later)
4. Hosting & domain — Namecheap shared hosting via cPanel's Git Version Control tool (deliberately switched from an earlier Cloudflare Pages plan — already-paid-for hosting), `aoe.ai` DNS stays on Namecheap pointing directly at it. Note: this deploy path has no auto-deploy-on-push — needs either manually clicking "Deploy HEAD Commit" in cPanel or a small webhook, decide which when this phase starts. Also when the pending-scan cron job gets wired to an actual scheduler.
5. Backups — scheduled `pg_dump` to Backblaze B2 (set up before RAG so the safety net exists before more complex data starts accumulating)
6. RAG AI — real embedding pipeline behind the existing `AIProvider` interface
7. Populate content — admins upload the real first-wave content
8. Marketing copy & translation — final wording, real translation API
9. Launch
