# AOEhub — policy pages and final wording: what each one must contain

> **Updated 2026-10-17.** This file is the current list. The older `AOEhub content and safety policy DRAFT 1.md` is **obsolete** (it still talks about Groups, four admins, public announcements and "No ads. No scams.") — do not write from it; at most borrow a sentence or two of wording. The final policy drafts ("DRAFT 2") will be written from this checklist once the decisions in section 11 and section 12 are answered. Changes since 2026-10-16 are marked **[new 10-17]** below.

Written 2026-10-16 for Clara, from the memory doc (chat7), the real build, and the policy DRAFT 1. This is a **checklist of points**, not the policies themselves. Use it to (1) brief a lawyer, (2) decide what you want each page to say, and (3) check my drafts later. Items marked **DECIDE** need an answer from Clara; items marked **LAWYER** need professional advice; items marked **BUILD** mean the policy only makes sense if a feature exists (so it affects the code, not just the words).

How these will be used: step 6b (the last step) writes the final text of everything below. Nothing here is legal advice.

---

## 0. The facts every policy must stay true to (what the hub really does)

This is the inventory the Privacy Policy and Terms are written from. If the build changes, this list changes.

**Who the hub is.** AOEhub (Alpha Omega Education), aoe.ai. **DECIDE/LAWYER:** the legal operator's name and address (the business is not registered yet; Terms and Privacy normally name the operator). Run from China; servers elsewhere (item: where the law applies).

**Personal information the hub holds**
- Account: email address, password (stored scrambled by the sign-in service), name, optional display name, **13+ age confirmation (a yes, not a birth date)**, which version of the Terms/policies was accepted and when.
- Coming in step 5: **region answer** (mainland China or not; the member's own statement, not checked), and the member's chosen language.
- Onboarding answers (all optional): situation (homeschooling / in school / unschooling / want to know more / new way of learning), what brought them, where they heard about us.
- What members post: experience posts, questions, comments, files (with labels), remix links, reports they file (the reviewers can see who filed), notifications they receive, who they follow, points and view/download counts.
- A record of which posts/files a member viewed or downloaded (once per day, used for view counts and points).
- **Safety records:** warnings (with a copy of the content at the time), restrictions, suspensions, who acted and when (the activity log), reports to the Creator, and **evidence kept after an account is deleted** (see retention).
- Optional own AI key (stored encrypted in the sign-in vault).
- Two-step sign-in (authenticator app) for those who turn it on; **required** for Watchers, Deacons and the Creator.
- Technical: IP address (in server logs of the hosting company, database host and rate limiting), sign-in cookies, and the browser's local storage for theme, text size, language and the welcome card.
- Coming in step 8: profile picture (re-saved as a fresh small image, virus scanned), profile frame/background/post font.

**Outside companies that see member data (the Privacy Policy must name each, what it sees, and where)**
- Supabase — database and sign-in (all account data).
- Cloudflare R2 — stored files (public bucket; private quarantine bucket for scanning).
- **Internet Archive — files that go there are public and permanent.** **LAWYER/DECIDE:** this conflicts with "erased after 30 days" and with deletion requests; the policies must say plainly what can and cannot be removed.
- Backblaze B2 — nightly database backups (contain everything in the database).
- Namecheap — website hosting and the domain.
- Google — (a) AI embeddings and Gemini answers/translation (member questions and public content are sent), (b) Google Cloud Run (the virus scanner, once built).
- Groq — backup AI for answers and translation: used automatically when Gemini hits its limit, and the hub returns to Gemini when it has rested (Clara's design, 2026-10-16). **Both Google and Groq must be named in the Privacy Policy**, with what each receives (member questions, public content to translate) and that the member cannot tell which one answered; a member's own key bypasses both.
- A member's own AI company — receives their questions if they add their own key.
- An email-sending service — password reset and alerts (provider not chosen yet).
- GitHub — the code and the backup job (no member data in the code).
- **Google's free tier can use what is sent and human reviewers may read it** (chat7 risk 1) → **DECIDE** free vs paid tier; the Privacy Policy must match the choice.

**More things the hub does now [new 10-17] — every one needs a sentence in the Terms and/or Privacy Policy**
- **Automatic translation of members' posts, titles, comments and file descriptions into each reader's language** (Gemini first, Groq as backup). The translated copy is **stored** (so it is made once), shown as "Translated from … · Show original", and **deleted with the original**. Terms: members allow the hub to translate and store translations of what they post. Privacy: the text is sent to Google/Groq to be translated. Translations are machine-made and can be wrong.
- **The interface language:** chosen from the browser's language on a first visit, saved in a **cookie called `aoehub.lang`** (a functional cookie), and saved on the member's profile so it follows them. Visitors in an unlisted language can cause that language to be **added automatically** and machine-translated (labelled as such).
- **Search for the AI ("embeddings")**: all public posts, files' descriptions, comments by Answerers/Verified on Questions and the philosophy books are turned into numbers by **Google's embedding service**, and every question a member asks the hub AI is also sent to Google for that. Google's free tier: Google may use what is sent, and its limits are low (1,000 pieces a day). The hub uses **two Google projects' keys** for capacity.
- **Backups:** every night a full copy of the database (all personal data and safety records, but not the AI search numbers) goes to Backblaze B2; kept daily for 30 days, then one a week for a year. State this in the retention table.
- **Sign-in security:** the Creator, Watchers and Deacons must use two-step sign-in (authenticator app); the Creator also has an access code and recovery keys; sign-in attempts to the Creator panel are logged. Members may turn on two-step sign-in too.
- **Questions posted by the AI on a member's behalf:** the hub AI can post an unanswered question to the Experience Board under the member's own name, after the member says yes.
- **The terms the member accepted** (which version, when) are recorded; a new version can require re-acceptance for one feature only.

**Moderation facts (Community, Content, Safety and Terms must describe them accurately)**
- Reviewers: Watchers (posts, comments, files), Deacons (posts, comments), the Creator (everything). Nobody can see who holds these roles; they show no badge. Only **A** (Answerer) and **V** (Verified) badges are public.
- Reviewers can add a notice (names only "a Watcher/Deacon/the Creator"), warn, delete, or dismiss a report; each needs a reason from a fixed list.
- Warnings are private and have a level set by the reason: green, yellow, red. 10 green = 1 yellow; 5 yellow = 1 red; **3 red = a one-week restriction** (read, download, but no posting/uploading/commenting); at 5 red an account can be reported to the Creator, who alone can delete it.
- **Emergency suspension** (a Watcher or the Creator) for serious cases, pending the Creator's review.
- Deleted content goes to a trash for **30 days**, then is erased; accounts deleted by the Creator or by the member are disabled at once and erased after **30 days**; the Creator can restore until then.
- No public announcements about violations: the person gets a private message with the reason.
- Everything reviewers do is logged and kept as evidence.
- **No appeal process exists yet** → **DECIDE/BUILD:** how a member contests a warning, restriction or suspension (at minimum: a contact address; ideally a form).
- Answers from Verified members and Answerers on Question posts help the AI answer other members; deleting one removes it from the AI's data.

---

## 1. Terms of Service (agreed at sign-up; shown in the footer)

1. Who we are and who may use the hub: **minimum age 13**; for younger children a parent or guardian is the account holder (COPPA). LAWYER.
2. The hub is free: the Experience Board and File Board are free, always. A **marketplace is planned** for later; terms can be updated with notice and must be accepted before using it (version tracking is built). Say nothing about ads either way (your rule). LAWYER: "terms may change with notice" clause.
3. Your account: accurate information, keep your sign-in safe, two-step sign-in, one person/family per account (DECIDE), you are responsible for what happens under your account.
4. **What you post and who owns it:** members keep ownership. **DECIDE (important): what permission does a member give?** (a) to the hub: host, show, translate, index for search and the AI, back up, keep in the trash and evidence; (b) **to other members: may they download, use and remix a file?** The hub promises "download, use and remix, always credited". Pick a licence model (for example a Creative Commons licence, or a custom "free to use and remix with credit"). LAWYER.
5. Authorship labels: Original / Remix / Not my work; honesty required; remixes link back automatically.
6. Rules: follow the Community, Content and Safety Policies (they are part of the Terms).
7. **Moderation and enforcement:** warnings, notices, restrictions, suspension, deletion, trash, evidence kept; no public announcements; how to contact us about a decision (appeals, see above).
8. **No responsibility for scams or disputes between members**; we work hard to prevent scams but cannot guarantee none will happen (the heads-up wording). LAWYER (jurisdiction).
9. **Link-out content is outside AOEhub:** not hosted, scanned or reviewed in advance; open at your own risk (the "Hosted outside AOEhub" label). LAWYER wording.
10. **Files and safety:** files are scanned but no scan is perfect; use at your own risk.
11. **The AI assistant and translation:** answers can be wrong; not professional advice; answers members write may be used to help answer other members; translations are machine-made and may contain errors; you may use your own AI key and then that company's terms apply.
12. Copyright: notice-and-takedown process and repeat infringers (links to the DMCA page, section 7).
13. Ending things: you can delete your account any time (switched off at once, erased after 30 days, Creator can restore until then); we can suspend or delete accounts for breaking the rules; what survives (evidence, files on the Internet Archive).
14. Disclaimers, limit of liability, indemnity, governing law and where disputes are heard, how disputes are resolved. LAWYER (operator and jurisdiction not yet decided).
15. Changes to the Terms: notice, version number, and how and when acceptance is asked again (built: acceptance is recorded per version and can gate one feature).
16. Contact details (section 9).

## 2. Privacy Policy (agreed at sign-up; footer; also linked after sign-in)

1. Who is responsible for the data (operator, contact for privacy requests).
2. **What we collect** — the full inventory in section 0, including that the **region answer is personal information** (your reminder), the 13+ answer, onboarding answers, safety records, view/download records, and technical data.
3. **Why we use each item** and the legal basis where the law asks for one (running the account, safety, legal claims, improving search/AI, translation).
4. **Who we share it with:** every company in section 0, what each sees, and where (mostly the US). **Member questions and content go to Google/Groq (and to a member's own AI company if they add a key).** State the free-tier human-review risk if the free tier is used.
5. **What is public:** posts, files, comments, display names, badges, points are visible to everyone, even signed out; files on the Internet Archive are public and permanent.
6. **Children:** accounts from 13; what happens if we learn someone is under 13 (delete); parent/guardian accounts; no verified-parental-consent flow. LAWYER (COPPA).
7. **How long we keep things (retention table):** trash 30 days; deleted accounts 30 days; **warnings, activity log and evidence kept after deletion** (period DECIDE/LAWYER); backups (nightly, retention rule: daily 30 days then weekly, DECIDE final); access logs (hosting company's policy); the AI's copy of content (removed when content is deleted).
8. **Your rights and how to use them:** see your data, correct it, delete your account, object, and **a copy of your data** (**BUILD gap: a "download my data" function does not exist yet; decide whether to build it**). Erasure limits: evidence kept for legal claims, Internet Archive files, backups.
9. Cookies and local storage: sign-in cookies (essential), the **language cookie `aoehub.lang`** and browser storage for theme/text size/language/welcome card; the hub also reads the browser's language setting on a first visit; no advertising or analytics trackers today (state it only while true). LAWYER: whether a consent banner is needed in some countries.
10. International transfers (servers outside your country; the operator in China) and **laws for users in mainland China** (item 28). LAWYER.
11. Security: encryption in transit, passwords scrambled, two-step sign-in, role checks on the server, API key vault; honest statement that no system is perfectly secure; what we do if there is a breach (notify, timing). LAWYER.
12. Changes to this policy (notice, version, re-acceptance).
13. How to contact us about privacy.

## 3. Community Policy (short, friendly; shown at sign-up)

1. The spirit: families walking their own path; disagree with ideas freely, never target a person.
2. How to treat each other: respect, honesty, credit others' work, help newcomers, no pressure to follow any one method.
3. Philosophy and faith discussion: welcome, kept civil; "wrong ideas" / "harmful ideology" must be defined by behaviour (see Content Policy, **DECIDE**).
4. Questions and answers: ask freely; Answerers (A) and Verified (V) badges explained in a sentence each; others' roles are never shown.
5. What the review team does and how members are told (private messages, never public) — a plain-language version of the warning levels and restrictions so nothing is a surprise.
6. How reviewers must behave (the seven rules for reviewers, summarised): reasons required, no self-review, everything logged, anything can be undone.
7. How to report something and how to ask about a decision.
8. Good-standing basics: one restriction level (a week) for repeated issues; suspension only for serious cases.

## 4. Content Policy (what may be posted)

1. The principle first: rules are about content and behaviour, **never about categories of people** (your hard rule; keep "no scams" and "inappropriate content" as separate rules, never mixed with a protected characteristic).
2. Authorship rules and "Not my work" labelling; permission to share; credit.
3. **Not allowed** (one rule each, with examples): scams and asking for money; ads and self-promotion (yellow reason); paywalled or paid content on the free boards (yellow); copyright infringement (yellow); inappropriate content (red); **harmful ideology or harmful content** and **"wrong ideas"** (red/yellow — **DECIDE/DRAFT: behaviour-based definitions, e.g. hate speech, harassment, threats, dangerous misinformation, spam; I propose wording, you approve**); harassment; off-topic/spam (green); harmful files/malware.
4. Children in posts: no photos of children with full names or locations; pen names and parent accounts when sharing a child's work; no private information about others.
5. Files: allowed types, size limits (hosted games/apps up to 50 MB zip with index.html; larger → link-out), no executable malware, scanning, flagged files are removed.
6. Link-outs: approved hosts list (GitHub, itch.io, Steam, own site, more by request), the "Hosted outside AOEhub" label, reviewable like any post.
7. AI-written content: whether and how it must be disclosed (**DECIDE**).
8. Questions posted to the board and answers: be accurate; answers by A/V members may be used by the AI.
9. What happens when something breaks a rule (links to the enforcement summary in the Community Policy and the Terms).
10. Copyright and takedown pointer (section 7).

## 5. Safety Policy

1. Our promise: we work hard to keep the hub safe but cannot guarantee anything (never "no scams").
2. **Child safety:** zero tolerance for content that sexualises or endangers children; emergency suspension; **reporting duties to authorities and how illegal material must be handled** (LAWYER); we keep a fingerprint (hash), not a copy, of deleted files until a lawyer says otherwise.
3. Scams and staying safe with other members: warning signs, never send money, report; no responsibility for private dealings (pair with Terms item 8).
4. Files, malware and link-outs: scanned files, scan limits, link-outs unscanned.
5. Privacy tips: don't share children's private details; what is public.
6. The AI assistant and translation: may be wrong; don't rely on it for safety, medical or legal matters.
7. Marketplace (later): safety rules will be added then.
8. **If someone is in danger:** local emergency services come first; how to flag urgent concerns to us (emergency suspension exists, an "urgent report" path is **DECIDE/BUILD**).
9. Reporting: the Report button, reasons, what happens next, privacy of reporters.
10. Contact for safety concerns (section 9).

## 6. About page

Who and why (Alpha Omega Education), the philosophy, who it is for (homeschool, unschool and school families), what is free and what is planned (the heads-up wording), how the hub is run (a small review team; **roles are kept anonymous — decide how much to say about who is behind the hub**), link to the policies.

## 7. DMCA / Copyright Policy and Takedown Process

1. **LAWYER/BUILD:** register a **DMCA designated agent** with the US Copyright Office (name, address, email) — safe harbour is not automatic.
2. How to send a notice: the legally required contents (identification of the work, the infringing material, contact details, good-faith and accuracy statements, signature).
3. What we do: review, remove or disable access (the item goes to the trash so it can be restored if the notice was wrong), tell the member privately.
4. **Counter-notice** process and timing (restoration after the waiting period unless the claimant sues).
5. **Repeat infringers:** copyright warnings feed the warning count (copyright is a yellow reason); how many strikes end an account (DECIDE; the warning rules above already apply).
6. Misuse: false notices.
7. Content on the Internet Archive and in link-outs: what we can and cannot take down.
8. Non-US copyright holders (a pointer or note).
9. Contact: the DMCA email. **BUILD (optional):** a takedown form that creates a report automatically.

## 8. Footer, sign-up and sign-in placement (what the member sees and agrees to)

- **At sign-up:** the 13+ confirmation and agreement to the Terms, Privacy Policy and the Community/Content/Safety policies (the box is built; it needs links to the real pages and the final text; the version number is already recorded).
- **Footer on the landing page:** About, Contact, Privacy, Terms, Community, Content, Safety, DMCA/Copyright. **Confirmed:** the same links, smaller, at the bottom of Settings after sign-in.
- **Profile (after sign-in):** a Contact link.
- **Account suspended or deleted:** the sign-in message and the suspended banner must show the contact email (**placeholder today; I will remind you** when the footer Contact link is built).
- Real **contact addresses to choose:** general, safety/urgent, DMCA, privacy requests, suspension appeals (one or several) — **DECIDE**.

## 9. Contact page

General contact, safety/urgent contact, DMCA agent contact, privacy requests, appeals about warnings/suspensions, response times (honest), postal address if the law requires one for the operator. **DECIDE** the addresses.

---

## 10. Final wording to write (everything that is draft text today)

**Marketing (landing) page:** headline and sub-headline; "browse without an account" lines; the pull quote; tagline (the two boards are always free · built by those who have walked this path); the three feature blocks (Experience Board, File Board, and the replacement for the removed Groups block if you want one); the marketplace heads-up note ("we plan… can't guarantee none will happen"); sign-up call-to-action. Needs native-speaker review in Chinese (and your sign-off in all five languages).

**Welcome cards:** the build has **four** distinct cards today — "exploring" (shared by *want to know more* and *just want to see a new way of learning*), *in school*, *homeschooling*, *unschooling*. You said three; tell me which to merge or drop.

**Onboarding (sign-in) questions:** (1) what's your situation (five choices), (2) what brought you here (four), (3) where did you hear about us (six, optional), (4) **new:** where are you using AOEhub from (mainland China / not — required), (5) your own AI key with the "we sincerely recommend using your own API… the default AI may be very slow" wording and the region-specific "Get free API instructions" steps (editable data; **Gab AI removed**).

**Other text people read:** sign-up and sign-in forms and the sign-in box heads-up; the "sign in to continue" box; the AI assistant (greeting, "I'm not confident… post your question on the Experience Board?", errors); the points explanation; the suspended/restricted banners; the role-change pop-ups; the system messages members receive (warnings, removals, role changes, question alerts — **these are written in English inside the database today, so they need a plan for other languages**); emails (password reset, security alerts, once the email service exists); the "Rules for reviewers" text; error messages.

**Policy pages themselves:** sections 1 to 9 above, in all languages the hub offers (English, Simplified and Traditional Chinese reviewed by a person; Spanish and French labelled as AI-translated).

---

## 11. Decisions that block the final text (collected)

1. Operator name/address; business registration (item 12).
2. The licence members give to others (section 1, item 4).
3. Free or paid Google tier; Google/Groq age terms (items 31, 32).
4. Definitions of "wrong ideas" and "harmful ideology" (behaviour-based).
5. Evidence retention period and what survives deletion; Internet Archive permanence.
6. Appeals process and the urgent-report path (both would need a small build).
7. Whether to build "download my data".
8. Contact addresses.
9. AI-written content disclosure.
10. Governing law and dispute venue (lawyer).
11. How much the About page says about who is behind the hub.
12. Which three welcome cards.
13. **[new 10-17]** Which Google plan at launch (free: no card, but Google may use the data and the daily limits are low; paid: a few cents, no data use) — the Privacy Policy must match.
14. **[new 10-17]** Whether the policy pages themselves are machine-translated into other languages, and the sentence saying the English (or Chinese) version is the one that counts. (LAWYER)
15. **[new 10-17]** Whether a cookie notice is needed for the language and sign-in cookies. (LAWYER)

---

## 12. Answer these FIRST — they change what I build (the rest of the text can wait) [new 10-17]

Everything else in this file is words, and the words can be finished last. These decisions, however, change the screens and features in the next build steps (scanner, game hosting, link-outs, profile pictures, password reset). Please answer them before, or while, you write the policies:

| # | Decision | Why it matters to the build |
|---|---|---|
| 1 | **What licence do members give others when they upload a file** (download/use/remix with credit; any limits)? | The upload form shows it, and the remix feature depends on it (Step 7). |
| 2 | **Must members say when a post or file is AI-made?** | A checkbox/label on the upload and post forms. |
| 3 | **Approved link-out sites** for games/apps over 50 MB (GitHub, itch.io, Steam, the member's own site — others?) and the **daily upload limit per member** | Stored as data; the limit protects the scanner's cost (Step 7). |
| 4 | **Do you want a takedown form** (a copyright holder fills it in and it becomes a report), **an appeals form** (a member contests a warning/restriction/suspension), **an urgent-report button** (serious safety concern), **"download my data"**? Yes or no for each. | Each is a small build I would add in Step 7/8 or at the end. |
| 5 | **Contact addresses** (general, safety, copyright/DMCA, privacy requests, suspension appeals) and the **"from" name/address for system emails** | Password reset and alert emails (Step 8) and the suspension screen need them. |
| 6 | **Operator name and address** (who runs the hub, legally) | Appears in the Terms, Privacy Policy and sign-up page. |
| 7 | **Evidence retention** (how long warnings and the activity log are kept after an account is deleted) | Sets the purge rules. |
| 8 | **Profile pictures:** allowed? who can see them? report them like posts? | Step 8 build rules. |

Once you answer 1 to 8, I can build Steps 7 and 8 without redoing anything when the policy text arrives.

