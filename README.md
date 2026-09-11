# AOEhub

**Alpha Omega Education** — a free education hub for homeschool, unschool, and school families. Domain: `aoe.ai`.

This is the real Next.js codebase, scaffolded around [`hub-prototype.html`](./hub-prototype.html) (the authoritative visual/interaction reference) and [`AOEhub memory from chat.md`](./AOEhub%20memory%20from%20chat.md) (the authoritative product/architecture decisions). Read both before making product decisions that aren't obvious from the code.

## Status: Phase 1 — Code foundation

Per the project's build order, this is step 1 of 9: the app is fully navigable and visually complete, but **everything is mocked** — there is no real database, auth, file storage, or AI yet. Every place that will need real backend work is deliberately isolated so Phase 2+ can swap it in without touching UI code:

| Concern | Where it lives now (mock) | Swapped for real in |
|---|---|---|
| Auth / sessions | `src/contexts/AuthContext.tsx` (localStorage flag) | Phase 2 — Supabase Auth |
| Database (posts, files, groups, users) | `src/lib/mock-data.ts`, read through `src/lib/data/*.ts` | Phase 2 — Supabase Postgres |
| File storage / downloads | Fake buttons in `src/components/files/FileDetailActions.tsx` | Phase 3 — Cloudflare R2 + Internet Archive |
| RAG AI assistant | `src/lib/ai/keyword-provider.ts`, behind `src/lib/ai/provider.ts` | Phase 5 — real embeddings + swappable model |
| Content translation | `src/lib/i18n/translate.ts` (seeded cache, no real API call) | Phase 8 — real translation API |
| Points | `src/lib/points.ts` (formula only, no live counting) | Phase 2 — real events written to Postgres |

Only `src/lib/data/*.ts` and the mock/provider files above should need to change when a concern goes from mocked to real — pages and components call into `src/lib/data/*`, not into `mock-data.ts` directly, wherever that split was practical.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Use the "Sign up" button to walk through onboarding — auth is a local mock (see table above), so it persists to your browser's localStorage, not a real account.

To see the admin dashboard, temporarily change `CURRENT_USER_ID` in `src/lib/mock-data.ts` to `"u-owen"` (the one seeded admin account), then revert it — there's no real user-switcher yet since there's no real auth.

## Structure

```
src/
  app/                    routes (App Router) — one folder per page in hub-prototype.html
  components/
    layout/               TopBar, PrimaryTabs, AppShell, SignInModal, ReportModal
    ai/                   the draggable AI chat FAB
    ui/                   design-system primitives (Card, Chip, Badge, Button, Modal, ...)
    discussion/           shared comment-thread UI (used by both boards)
    files/, profile/, brand/   feature-specific small components
  contexts/               AuthContext, ThemeContext, LanguageContext, ReportContext
  lib/
    types.ts              core domain types — shape the future Postgres schema loosely follows
    mock-data.ts           in-memory sample content (Phase 1 only)
    data/                  data-access layer — swap Supabase in here for Phase 2
    theme-presets.ts        the 15 alternate themes, ported verbatim from the prototype
    fonts.ts                next/font setup for every font the themes reference
    points.ts               the points formula (see memory doc for the exact numbers/rationale)
    ai/                      swappable AI provider interface + placeholder implementation
    i18n/                    UI dictionary (en/zh-CN/zh-TW) + on-demand content translation
```

## Design system

Colors, spacing, and component classes (`.card`, `.chip`, `.badge`, `.pin`, etc.) are ported directly from the prototype's `<style>` block into `src/app/globals.css` as plain CSS driven by custom properties — per the project memory, these are already fully specified and shouldn't be re-derived. Tailwind is installed (for base resets) but isn't the primary styling mechanism here; that's a deliberate fidelity choice, not an oversight.

Theme switching (Settings → Appearance) works by having `ThemeContext` set those same custom properties at runtime — see `src/contexts/ThemeContext.tsx`.

One accessibility detail worth knowing before touching layout: the text-size control applies CSS `zoom` to a wrapper around top bar + tabs + page content only (see `AppShell.tsx`), never to the whole app shell — `zoom` changes the containing-block behavior of `position: fixed` descendants, which would misposition the AI chat FAB and modals if it were applied higher up.

## What's next (per the roadmap in the memory doc)

1. ~~Code foundation~~ ← you are here
2. Backend — real Supabase project, schema, pgvector, real auth
3. File storage — Cloudflare R2 + Internet Archive, real upload flow
4. Hosting & domain — Cloudflare Pages, then `aoe.ai` DNS
5. RAG AI — real embedding pipeline behind the existing `AIProvider` interface
6. Backups — scheduled `pg_dump` to Backblaze B2
7. Populate content — admins upload the real first-wave content
8. Marketing copy & translation — final wording, real translation API
9. Launch
