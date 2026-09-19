# AOEhub — Project Context

**Read this first.** This file captures every real decision made while designing AOEhub, across a long planning conversation. `hub-prototype.html`, if it's sitting in this same folder, is the authoritative *visual and interaction* reference — layouts, copy, component behavior. This document captures the *why*, the *formulas*, and the *non-visual architecture* that don't show up just from reading the HTML.

## What this is

AOEhub (full name: **Alpha Omega Education**) is a free education hub for homeschool, unschool, and school families — built around a core philosophy: **you don't copy someone else's path, you walk your own, using their experience so you don't repeat wrong turns.** "Education is an atmosphere, a discipline, and a life" is the pull-quote that captures the spirit. It's for children to learn *and* for parents/guardians/teachers to keep learning too.

Domain: **aoe.ai** (already owned, registered via Namecheap). It currently hosts an existing AOE curriculum site that will be migrated into the hub as its first real content.

## The three spaces

- **File Board** — free curriculum, books, cards, games, printables, songs, apps. Anyone can upload, download, remix. Points are earned here.
- **Experience Board** — real stories *and* philosophy discussion, merged into one space. There is **no separate "Our Philosophy" tab** — it was deliberately folded in, because philosophy belongs to everyone, not just admins. A "Philosophy" tag/chip lets people filter for it. Anyone can post philosophy content directly (no admin review gate) — this replaced an earlier design where only admins could post curated philosophy.
- **Groups** — public (searchable, joinable) or private (invite-only, invisible to non-members). Private groups are still visible to admins for moderation — "private" means private *from other members*, not from the platform itself; this should be stated plainly if it's ever explained to users.

## Points system (exact formula)

- 1 point per view (rate-limited to once per person per day, to prevent gaming)
- 5 points per download
- 3 points per question/comment left on your post
- 10 points per remix of your file
- **Search ranking** uses a *log-compressed* version of these points (so one huge hit doesn't permanently bury newer good content) — but a user's **profile total is a simple, honest sum**, not compressed.
- Points only ever come from File Board and Experience Board activity. Private Groups earn no points.
- Experience Board's own display order stays **chronological**, not popularity-ranked, even though its posts contribute to points — this was a deliberate choice to keep it from becoming a popularity contest.

## Trust & safety

- **Exactly 4 admins.** Powers: moderation dashboard, ban/remove, post pinned announcements, answer questions the RAG AI can't. Admins also post as regular members (labeled with an "admin" badge wherever they post, for transparency).
- **Report button** on everything: files, posts, comments, public groups, and private groups (any member can report their own group).
- Report reasons (structured, not free text): scam/money request, off-topic, inappropriate content, paywalled/costs money, copyright/not their work, something else.
- **Admin dashboard shows groups/users only when reported or searched — never a default scrollable list.** This is deliberate: it prevents an admin from accidentally misclicking "delete" while idly scrolling.
- **Authorship field is required at upload**: Original / Remix / Not my work. Remixing auto-links back to the original creator — this is structural, not something the uploader has to remember to add.
- File posts keep a lightweight **version history** (changelog note on update) so old download links don't silently break for people who already built around a previous version.
- **Every uploaded file must be scanned for malware before it's downloadable** (ClamAV or the VirusTotal API). Flagged files get quarantined automatically, never shown publicly.
- **Multi-file bundling**: one upload post can contain several files (e.g. different language versions of the same document, or chapter-by-chapter curriculum). Each file gets its own label and its own download button — this avoids forcing someone to split one logical resource into many separate posts.
- **The hub takes no responsibility for a user being scammed by another user** — this should be stated plainly in the Terms of Service. This is standard practice for platforms like this, but still worth a real legal read for the specific jurisdiction, same as the DMCA point below.
- **Confirmed scams/violations get publicly announced** — once an admin has actually investigated and confirmed a real violation (not on a bare accusation), the offending group and the confirmed violator(s) are removed, and a public announcement is posted (via the admin announcement post type on the Experience Board) warning the wider community that this happened, so people can be careful. This follows the same "human review before action" principle already established for reports generally — never automatic, always admin-confirmed first.
- **Content policy wording principle**: the "no scams" rule and any inappropriate-content rules must be kept as separate, distinct rules — never worded in a way that conflates a protected characteristic (e.g. sexual orientation) with prohibited content. The policy targets actual content/safety issues (scams, inappropriate content, off-topic material), not categories of people. This was an explicit early correction in this project's planning and should be treated as a hard constraint when the actual policy/rules page gets written.

## Access model (logged-out vs signed-in)

- Logged-out visitors can **freely browse and read** File Board and Experience Board (including Philosophy-tagged posts) — no account needed to look around.
- They **cannot**: download, post, comment, remix, follow, report, or join groups. All of these are gated behind sign-up.
- **Sign-up triggers a short, skippable onboarding.** Questions, all optional as a set (a "Skip for now" option always available):
  1. **What's your situation?** — homeschooling / in school / unschooling / want to know more about education, what it's about / just want to see a new way of learning. (This replaces an earlier, narrower draft of this question that was framed only around homeschool experience level — the new version fits the hub's actual stated audience of "homeschool, unschool, and school families alike," including people who aren't doing any of the three yet and are just curious.)
  2. **What brought you here?** — curriculum ideas / community & support / philosophy & the big picture / not sure yet.
  3. **Do you have your own AI API key, or want to use one of your own?** — see the RAG AI section below for full detail on this question specifically.
  
  After onboarding (or skipping it), the user is returned to the **exact page or file they were trying to interact with** when they hit the sign-in wall — not dumped on a generic homepage. This matters: someone hitting "download" on a specific file, signing up, should land back on that same file ready to download.
- **Logging in (existing user) skips onboarding entirely** and returns straight to wherever they were.
- If onboarding indicates "new to this" / "want to know more about education," a one-time welcome card appears on the Experience Board pointing them to the Philosophy tag and the File Board's beginner picks.

## Content organization

Two **separate** taxonomies — don't conflate them:
- **Sections** (subject/category): Curriculum, Games, Books, Cards, Songs, Art projects, Printables, Apps.
- **Media type filter** (file format): Video, Audio, Image, Document, Game/App.

**Following system**: users can follow/unfollow other users. Followed users' new posts/uploads appear in the follower's notifications.

**Notifications**: a real panel (not just an icon) — new replies, questions on your posts, activity from people you follow.

## RAG AI — four jobs, specific behavior

The AI assistant exists to:
1. Answer philosophy questions
2. Suggest content to people who don't know what to search for
3. Explain what a given file or post is about
4. Handle translation (see below)

Behavior rules:
- It answers **general user questions directly** at any time (floating chat button, available everywhere).
- It is **also the first-response layer for questions specifically directed at the admins**, since 4 volunteer admins can't always answer fast — if it can't answer confidently, the question should route to the admins instead of guessing.
- It is **never involved in peer-to-peer file/post discussion threads** — if someone asks the uploader/poster a question in a discussion thread, that's always answered by a human (the poster), never the AI.
- It must respond in whichever of the three language options the user has selected (see Translation below).
- **Bring-your-own-API-key**: asked as one of the onboarding questions at first sign-in (see Access model above) — a paste-in field for their own API key/link, framed roughly as: "Have your own AI API, or want to use one? You can paste it here — otherwise we'll use ours, though it may not be as good as your own." Mention Google AI Studio as a place to get a free API key for anyone who wants one but doesn't have one yet. If they skip this or don't want one, the hub's own default API is used, no setup required. **Note this is a reversal of an earlier draft of this decision**, which had placed this toggle in Settings only, specifically to avoid friction at sign-up — that reasoning still has merit (most users won't know what an API key is), so consider keeping it *skippable* within the onboarding flow (consistent with the other onboarding questions) and *also* still editable later in Settings for anyone who skips it at sign-up but wants to add one afterward — best of both: visible to the people who'd want it, without blocking anyone who doesn't. Only the answer-*generation* step is swapped per-user; `pgvector`'s retrieval/search step is untouched by this, it's a completely separate piece of code from the generation call. The key must be stored using **Supabase Vault** (its built-in encrypted-secret storage), not a plain database column — this is a real credential, equivalent in sensitivity to a password.
- **The underlying model should be swappable in the code** — architected so the team can use a commercial API (e.g. Anthropic API) or swap in a self-hosted local open-source model (e.g. Llama/Qwen/Mistral via Ollama or vLLM) without rewriting the surrounding system. Don't hard-lock to one provider.
- The chat button should be **user-draggable** (repositionable anywhere on screen, works on touch and mouse) so it never permanently blocks other UI, and the chat panel itself should reposition intelligently (flip left/right/up/down) so it always stays fully on-screen regardless of where the button has been dragged.

## Translation

- **Only two languages are supported: English and Chinese** — but Chinese is offered as two separate options (Simplified and Traditional), so there are **three language buttons total**.
- Translation covers **both** the hub's own interface **and** user-generated content — post titles/descriptions, file introductions, and comments — via a small on-demand "Translate" button on each piece of content.
- **Downloaded file contents themselves are never translated** — only the surrounding text (titles, descriptions) is. This should be stated clearly to users so expectations are set correctly.
- **Cost-saving pattern**: cache a translation the first time it's requested and serve the cached version to everyone after that, rather than re-translating on every view. Only genuinely new/uncached content should trigger a new translation call.
- The language picker should be available even to logged-out visitors (in the header), since people need to read the pitch in their own language *before* deciding to sign up — not just after.

## Accessibility

Settings includes a **text-size control** (four sizes) that scales the whole interface — text, buttons, spacing together — for users with limited vision. Implementation note: if using CSS `zoom` for this, be careful it doesn't get applied to an ancestor of any `position: fixed` elements (floating buttons, modals) — zoom can change their containing-block behavior and misposition them. Scope the zoom to a wrapper around the scrollable content only, not the whole app shell.

## Branding & theming

- Name: **AOEhub**, always paired with "(Alpha Omega Education)" somewhere near first mention so the abbreviation isn't unexplained.
- Logo: two tree shapes flanking a small sprout growing out of an open book, in a moss-green/black palette — animated as a sequential reveal (book fades in, then trees, then the sprout grows and its leaves unfurl) in the hero section.
- Default theme: warm cream background, moss green accent (`#3F6B4F`), Lora serif for headings, Inter for body text.
- **15 additional themes** sourced from tweakcn.com are already fully specified with exact OKLCH color values, fonts, and radius — these exist in full inside `hub-prototype.html`'s CSS already; don't re-derive them, just port that CSS forward.

## Legal (needs real follow-through, not just design)

- **DMCA safe-harbor protection is not automatic.** It requires actually registering a DMCA agent and maintaining a real notice-and-takedown process. Without this, the hub could carry real liability for user-uploaded copyright infringement. This needs an actual legal review before launch, not just a policy page.
- Terms of Service should include a general liability disclaimer for disputes between members (especially relevant for private groups) — standard for platforms like this, but still worth real legal review for the specific jurisdiction.

## Launch plan

- **The hub launches empty of community content.** The four admins upload the *first* real content themselves, migrated from the existing aoe.ai site: curriculum, philosophy books, teacher's manuals, songs, and posts. Since it's their own existing content, there's no copyright ambiguity here (unlike future user uploads, which do need the DMCA process above).
- **Growth strategy**: go to homeschool communities that already exist (forums, Reddit, Facebook groups) and build real relationships to bring in the first outside contributors — explicitly **not** a money-based incentive model (ruled out early, since it conflicts with the "free forever" philosophy).
- **Marketing page copy is not finalized.** The current hero wording in the prototype is a placeholder that tested well in planning — the project owner intends to supply the *exact final wording* for the marketing/introduction section before launch. Don't treat the current copy as final; check before shipping it.

## Tech stack

- **Frontend**: Next.js
- **Hosting**: Namecheap shared hosting via cPanel (not Cloudflare Pages — deliberately switched; Clara already pays for Namecheap hosting with unmetered SSD storage shared across a few other sites, and wants to use what's already paid for). Deployment works through cPanel's **Git Version Control** tool, connected to the GitHub repo via SSH deploy key. Important: this connection does **not** auto-deploy on push the way Cloudflare Pages does — updating the live site requires clicking "Deploy HEAD Commit" in cPanel, or building a webhook (GitHub → a small script on the host) to trigger that automatically. Decide and build one of these two paths in Phase 7 (Hosting & domain), don't assume auto-deploy exists by default.
- **Git commit convention**: Claude Code will make real commits for this project (git add/commit/push), directed through the normal conversation, not a hidden auto-commit process. **Turn off the default "Co-Authored-By: Claude" / "Generated with Claude Code" attribution** in commit messages for this repo — Clara's explicit preference, configure via the `attribution` setting in Claude Code's `settings.json` before the first commit. **Commit author name: "AOE Team"** — set this via `git config user.name "AOE Team"` (and a matching email via `git config user.email`) before the first commit, so every commit in this repo's history is attributed consistently under that name rather than Clara's personal name. Since the repo is private, this is only visible to people explicitly invited to it anyway.
- **Backend**: Supabase — auth, Postgres database, real-time notifications, all in one (free tier to start). **Deliberately stays in use regardless of frontend hosting choice** — this was explicitly evaluated and confirmed: Namecheap/cPanel's own database (MySQL always; PostgreSQL only on higher Stellar Plus/Business tiers) cannot run the `pgvector` extension the RAG AI depends on, since shared hosting environments block custom extension installs for security/multi-tenancy reasons — this is standard across shared hosting generally, not a Namecheap-specific gap. Supabase also bundles auth and real-time, which a raw cPanel database doesn't include and would otherwise need to be hand-built.
- **RAG storage**: `pgvector` extension inside the same Supabase Postgres database — no separate vector database needed
- **Large files**: Internet Archive (free, permanent, nonprofit — no backup strategy needed here, that's their whole mission). Note: IA fits documents/audio/video well, but is a poor fit for anything meant to be played live in-browser (modern games, interactive web apps) — IA's software support is built around emulating legacy/retro software, not serving live modern web content. Route browser-playable games/apps through R2 + the hosting layer instead.
- **Smaller assets**: Cloudflare R2 (zero egress fees). Confirmed to work completely independently of whichever company hosts the frontend — R2 is just an API-accessible storage bucket, not tied to Cloudflare Pages specifically.
- **Malware scanning**: lean on the **VirusTotal API** as the default for now — it requires no server to maintain, which fits a hosting setup that already has enough moving parts. ClamAV was considered as an alternative, but self-hosting it needs an always-on server; Oracle Cloud's free tier was evaluated and rejected for this (real capacity-provisioning problems, was reduced again in 2026, and puts ongoing Linux server maintenance on Clara personally). If ClamAV is revisited later, Render's free web-service tier is the better-fit path (accepts a cold-start delay after inactivity, but no server admin burden) — not Oracle.
- **Domain**: Namecheap (aoe.ai), free WHOIS privacy in use. DNS points at the Namecheap hosting directly now that hosting is also on Namecheap (simpler than the earlier Cloudflare-Pages-based plan, which needed DNS delegated to Cloudflare specifically). Optionally, Cloudflare could still be layered in front purely for its free CDN/DDoS protection even with Namecheap doing the hosting — not yet decided either way, revisit if performance becomes a concern.
- **Backups**: Supabase's own automatic daily backups (paid tier) as the first layer; **plus** a scheduled GitHub Action running `pg_dump` to a separate storage provider — **Backblaze B2**, chosen specifically for its permanent 10GB free tier (not time-limited like AWS's), no credit card required to sign up per Backblaze's own current pages, and cheap pay-as-you-go pricing beyond that if ever needed. Different company than Supabase deliberately, for redundancy. Clara also wants to periodically pull a personal copy of that backup to her own computer manually. Code/design already backs itself up naturally through the normal GitHub workflow — this backup plan is specifically for the *database*.
- **Backup retention policy — required, not optional**: nightly full backups accumulate storage over time if kept forever (each one is a complete snapshot, not just changes since the last one). Build a rotation that automatically deletes backups past a set age (e.g. keep the last 30 daily backups, delete anything older) so storage stays small and bounded indefinitely, rather than growing every single night forever.
- **Backblaze B2 spending cap — set this immediately on account creation, don't skip it.** B2's "Caps & Alerts" dashboard feature lets you set a maximum spend and get emailed/texted at 75% and 100% of it — but per Backblaze's own documentation, if no cap is set, the account has **no limit at all** and charges could accrue unbounded. This is opt-in, not a default safety net. Set a low cap (e.g. $1–2) right away — given the tiny actual backup size, this gives an early warning long before any real charge could happen.
- **On self-hosting the database in the future**: explicitly discussed and deliberately deferred, not ruled out. Because Supabase runs standard PostgreSQL (not a proprietary format), a full export/migration to a self-hosted Postgres server is a clean, well-understood path any time later, using `pg_dump` (export) and `pg_restore` (import) — the same tool already used for routine backups. Reasons to stay on Supabase for now: no server to personally secure/patch/monitor, no need to hand-build the auth system (a genuinely higher-risk undertaking than using a well-tested existing one), and no added cost. If self-hosted later: gains full control and removes the `pgvector`-on-shared-hosting limitation entirely (a fully-controlled server has no such restriction), but adds real ongoing responsibility — crash recovery, attack monitoring, patching, and incident response become Clara's job rather than Supabase's, even though most of that can itself be automated (process managers like `pm2`/`systemd` for auto-restart on crash, `fail2ban` for repeated-login-attempt blocking, unattended security updates, free uptime monitoring like UptimeRobot). Don't build anything during the initial build that would make a future export harder than it needs to be.

## Build order (roadmap, in sequence)

1. **Code foundation** — scaffold the real Next.js codebase in GitHub, structured around `hub-prototype.html`
2. **Backend** — Supabase project, real database schema, pgvector enabled, real auth/sign-up wired up
3. **File storage** — Cloudflare R2 bucket + Internet Archive account, upload flow routes files correctly
4. **Backups** — the scheduled GitHub Action described above, set up early so the safety net exists before more complex data (RAG embeddings, real content) starts accumulating
5. **RAG AI** — real embedding pipeline, swappable model connection, real chat backend, bring-your-own-API-key support
6. **Marketing copy, translation & policy wording** — swap in final marketing wording once supplied; connect language switcher and translate buttons to a real translation API; **this phase also covers writing the actual final wording for the Content Policy and Safety Policy shown at sign-up** (not just marketing copy) — both were previously placeholder/pending, both get finalized together here since they're both "final text to put in front of users" work
7. **Hosting & domain** — deploy to Namecheap via cPanel's Git Version Control tool; decide on manual "Deploy HEAD Commit" vs. building a webhook for auto-deploy; since the domain is already on Namecheap too, DNS is simpler than the earlier Cloudflare-Pages plan — no delegation to a different company needed. Deliberately placed *after* backups/RAG AI/copy so the app is feature-complete before going live, rather than deploying early and building on top of a live site.
8. **Populate content** — admins upload the real first-wave content; admin accounts get real permissions
9. **Launch** — final cross-device test, then go live and begin the relationship-first growth approach

## Footer placement

Currently built on the **logged-out marketing/Home page only** (About / Contact / Privacy Policy links, content intentionally left blank as placeholders until Phase 6 fills in the real policy wording). Open question raised: should this also appear somewhere in the signed-in app, not just the pre-signup page? Recommended default, not yet confirmed with Clara: keep the full footer on the marketing page for logged-out visitors, and add a smaller link to the same three pages from the bottom of the **Settings** page in the signed-in app — that's the natural "account/reference info" spot, rather than repeating a full footer on every single interior page of what's otherwise an app-style interface (tabs/boards), which would feel repetitive compared to a marketing site built for longer scrolling. Confirm this placement before building it.

## A note on how this project has been worked on

Every major decision above went through real back-and-forth — features were proposed, tested in the interactive prototype, and sometimes reversed once a problem was spotted (e.g. Philosophy started as an admin-only tab and was later deliberately folded into Experience Board; file downloads started open to logged-out visitors and were later gated behind sign-up). If something in this document seems to contradict something else, the more recently-stated version here is very likely the deciding one — but when genuinely unsure, it's worth asking rather than assuming.
