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
- *Built 2026-10-17:* translation is on by default for every reader; Simplified ↔ Traditional Chinese is converted by a free rule-based converter (nothing sent to Google/Groq); everything else goes to Gemini (Groq if Gemini is full). A **daily cap** (starts at 2,000 texts a day, changeable) pauses translation for the rest of the day, and then the original is shown. Staff panels show content translated into the staff member's language (the panel buttons stay English).
- **The interface language:** chosen from the browser's language on a first visit, saved in a **cookie called `aoehub.lang`** (a functional cookie), and saved on the member's profile so it follows them. Any visitor (signed in or not) can type the name of a language that is not listed; the AI then translates the hub's interface into it (labelled machine-translated). **Limits: 3 new languages a day, 30 extra languages in total** (changeable). The name a visitor types is sent to Google/Groq to identify the language.
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

**Welcome cards — what each is for and what it must say (added 2026-10-17).** One card, shown once, on the Experience Board, right after sign-up. It is picked from the member's answer to onboarding question 1 ("what's your situation") and saved only in the browser (it disappears after it is shown). Every card must: (a) be warm and short (2–3 sentences, no lists); (b) tell the member who this hub is for and that they belong; (c) point to ONE or TWO concrete first steps on the hub (the Philosophy tag on the Experience Board, the File Board's beginner picks, posting an experience, or asking the AI); (d) never sell, never mention points, and never assume a belief or a school choice; (e) read well in Chinese as well as English.

| Card | Shown to people who answered | Purpose | Must contain | Draft text today (English) |
|---|---|---|---|---|
| **Exploring** | "I want to know more" and "just want to see a new way of learning" | They are new to the whole idea | A welcome; the "why" (Philosophy tag) and the "how" (File Board beginner picks) | "Welcome — glad you're here. Since you're just starting to explore this, a couple of good places to begin: try the **Philosophy** tag right here on the Experience Board for the "why," or the File Board's beginner picks for the "how."" |
| **In school** | "My child is in school" | Make clear the hub is not only for homeschoolers | That school families are welcome and why they use it (extra practice, another way of thinking, curiosity); the Philosophy tag to see what the community believes; the File Board | "Welcome — glad you're here. AOEhub isn't just for homeschoolers — plenty of school families use it too, for extra practice material, a different way of thinking about learning, or just to see what else is out there. The **Philosophy** tag … is a good place to see what this community actually believes, and the File Board has plenty worth browsing either way." |
| **Homeschooling** | "We homeschool" | They are new to the hub, not to homeschooling | That their experience is valuable; invite them to post what is working (or not) on the Experience Board; the File Board has curriculum other families have tried | "Welcome — glad to have you. You're new to the hub, not to homeschooling — so you've probably already got something worth sharing. Post about what's working (or isn't) … and the File Board is full of curriculum other homeschooling families have already put through its paces." |
| **Unschooling** | "We unschool" | Same, for unschoolers | That this community values their perspective; invite them to share how it is really going; resources other unschoolers found useful | "Welcome — glad to have you. You're new to the hub, not to unschooling — this community values that perspective a lot. Share how it's actually going for you on the Experience Board, and check the File Board for resources other unschoolers have already found useful." |

You said three cards, the build has four (the two "new to the idea" answers already share one). Tell me which two to merge (the natural pair is **Homeschooling + Unschooling**, since both say "you're new to the hub, not to the way of learning"), or which to drop. You also decide the final words; the draft text above is only a placeholder and is translated into Chinese in the app.

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


---

## 13. Clara's answers, 2026-10-20 (sections 11 and 12) and what is still open

### Settled (I will build / write it this way)
- **Upload acknowledgement (11.2 / 12.1):** members tick "I understand that the file I upload here can be downloaded, remixed (with or without credit) and used by other people. The hub tries to give credit, but it cannot track every copy, so some remixes may not carry the remix label or link back to my original." Remixes made with the hub's Remix button link to the original automatically. *Suggested addition (Clara to confirm):* "…and I have the right to share it."
- **AI-made label (11.9 / 12.2):** an **optional** "Made with AI" checkbox on the upload and post forms. Never required.
- **Link-out sites (12.3):** GitHub, itch.io, Steam, the member's own site, Unity's own game hosting (Unity Play). Stored as editable data.
- **Forms (11.6 / 12.4):** takedown, appeals and urgent report: **yes to all**, plus **urgent reports sit at the very top** of the reviewers' list. Reports go to Creator / Watchers / Deacons according to the existing file-or-post rules.
- **Google plan (11.13):** free plan at launch; paid only when there is money or it is unavoidable. Privacy Policy must match (Google may use free-plan data; human reviewers may read it). **The Terms, the Privacy Policy and the AI chat box must tell members not to put private information into the hub AI.**
- **Google/Groq age terms (11.3):** not a concern for Clara (members are adults).
- **Welcome cards (11.12):** three cards — **Exploring**, **In school**, **Homeschooling + Unschooling (one shared card)**. Every card welcomes the member and says what the hub has (Experience Board, File Board, the hub AI).
- **Policy languages (11.14):** the official policy pages are in **English and Chinese**. A member whose language is English sees English; Chinese sees Chinese; any other language sees the English page with a "Translate into my language" button (AI, labelled unofficial; the English/Chinese text is the one that counts).
- **Cookie notice (11.15):** yes, if it needs no third-party tool and costs nothing: a simple information notice, no tracking tools. (Lawyer to say whether a consent banner is legally needed for the sign-in and language cookies.)
- **Contact (11.8 / 12.5):** Clara will give the official email.
- **Profile pictures (12.8):** visible to anyone who can see the profile (see open question about reporting).

### Still open — answers needed before Steps 7 and 8
1. **Operator (11.1 / 12.6):** name + email is fine to start; what name is shown publicly, and is a postal address needed (a P.O. box is possible)? Conflicts with Creator anonymity?
2. **Governing law (11.10):** which country/state does Clara live in? (It is the law and court that settle a dispute between the hub and a member.)
3. **Daily upload limit (12.3):** proposal 100 files and 1 GB per member per day, adjustable by the Creator.
4. **Appeals:** who receives them (recommended: Creator only)?
5. **"Download my data" (11.7):** explained to Clara; yes or no?
6. **Evidence retention (11.5 / 12.7):** Clara's rule (self-deleted: wiped at once; Creator-deleted: kept 1 month) conflicts with the 30-day restore and lets a warned member erase their record by deleting their account. Options sent to Clara.
7. **Content rules (11.4):** Clara supplied the Platform Content Guidelines list. Questions: how strictly reviewers apply it (remove at once vs the warning ladder), a reviewer test for the LGBTQ+ and spanking lines, whether quality rules ("twaddle", over-stimulation) are bans or guidance, how the hub AI should behave, and a lawyer read of the child-discipline and protected-group sections.
8. **Official Chinese policy:** Simplified only (Traditional converted automatically) or two written versions?
9. **Profile pictures:** report them? (reasons given to Clara)
10. **About page (11.11):** Clara is thinking about it.

### Second round of answers, 2026-10-20 (later the same day)
**Settled:**
- **Public name (11.1 / 12.6):** "AOE Team" is the public Creator/operator label; Clara's real name is used only where a law or registration truly needs a human name (for example the US copyright agent registration). Postal address: undecided (little real mail arrives; see reply); can be left out at launch.
- **Governing law:** understood (the law and courts named in the Terms settle disputes between the hub and a member). Clara's location still needed.
- **"Download my data":** yes, if it costs no storage (it is built on the spot and not stored). Built at the end.
- **Profile pictures:** a "Report profile picture" option in the report-user menu (three dots). The report goes to Creator/Watchers/Deacons, who LOOK at the picture first. Only if it breaks "No graphic, sexual, or adult content" is the picture removed (back to initials) and the member sent a notice asking them to change it. If it is fine, the report is dismissed and nothing is sent. Reviewers never handle reports about their own account (already how the panels work: they can see that a report exists and why, but another reviewer decides).
- **Upload limits:** default 100 files and 1 GB per member per day, **changeable up or down in the Creator panel without a code change**, easy to reach, with a per-member override; the Creator account itself is not capped. Clara will upload very large packs while testing (a few MB up to tens of GB per pack, made of several files).
- **Appeals:** an appeal (and any report about a Watcher's or Deacon's own account) is decided by a reviewer other than the person whose decision or account is involved. Anything decided by the Creator can only be appealed to the Creator.
- **Chinese policies:** Simplified written by Clara; Traditional converted automatically by the free converter.
- **Evidence retention:** **30 days for both** self-deleted and Creator-deleted accounts (disabled at once; personal data, warnings and the activity log about that member erased on day 30; the Creator can restore until then). Backups keep older copies up to a year, so the Privacy Policy must say so (or the weekly backups get shortened).
- **Content rules:** Clara supplied a short "Strictly banned / Allowed & supported" list (replaces the list from the first round as the public summary). Allowed includes traditional measured parental discipline, including Biblical corporal correction.

**Still open:** the largest SINGLE file in the big packs (scanner limits, see reply); how strictly each content rule is enforced (permanent ban vs warning ladder vs notice); the reviewer test for "LGBTQ+ ideas, gender theories or sexual orientation topics"; how the hub AI should behave on these topics; whether the long list becomes the reviewers' detailed guide; Clara's location (governing law); the official email address; whether to leave the postal address out at launch.

---

## 14. What each policy page must say, from Clara's answers (2026-10-20) [new]

**Content rules, final structure (Clara, 2026-10-20):**
1. **Permanent ban and removal:** child abuse, cruelty, neglect or emotional terror; graphic, sexual or adult content; hate speech, violence or dehumanization (race, origin, sex); cultic recruitment, high-control groups, psychological manipulation; religious extremism, calls to violence, spiritual abuse; **scams** (educational scams, MLM, fake "miracle" cures); selling or promoting hazardous supplements or unverified medical practices.
2. **Removal plus the warning ladder:** teaching or promoting LGBTQ+ ideas, gender theories or sexual-orientation ideas as right or welcome (especially to children); undermining parental authority or encouraging secrets from parents; **scams** (also here, for lesser cases).
3. **Notice only (no removal, no ban):** "twaddle" (shallow busywork, vulgar content, mindless screen reliance) and high-stress cramming / public shaming.
- **The LGBTQ+ line, in Clara's words:** *not* any mention. A member saying these ideas are wrong, or telling parents how to avoid them, **stays**. A parent asking how to answer a child's question **stays**. A faith statement **stays**. What goes is content that **teaches these ideas as right and to be welcomed, or promotes them to children.** This is the part where the hub helps new parents.
- **Allowed and supported:** traditional parental authority and loving discipline, in general terms (**the corporal-correction / spanking wording was removed at Clara's decision, 2026-10-20**, so no lawyer read of it is needed; the zero-tolerance rule on abuse and cruelty stays); traditional faith, prayer, scripture study, creationism and religious values; high-quality classical materials and rich literature; discussion of the soul, spiritual growth and moral character; open inquiry into natural mysteries and unexplained phenomena.
- **The long list** (the detailed first-round guidelines) is posted by Clara's own account as a "thought" post on the Experience Board and is also the reviewers' detailed guide (Rules for reviewers); the short list above is the public summary in the Content Policy.
- **The hub AI on these topics:** it answers only from its books and approved community answers (the RAG data). If it cannot answer, it offers to post the question on the Experience Board so other members answer and Verified members and Answerers can confirm. (Already how it works.) The AI also carries the reminder: **do not put private information into the hub AI.**

**Terms of Service:** operator = **"AOE Team"** (Clara's real name only where a law or registration needs a human name; lawyer); governing law and courts = those of Clara's place (**location still needed**; covers disputes between the hub and a member; does not cover a suit by an outsider such as a copyright holder; a member's own consumer-protection rights may still apply; LAWYER); the **upload acknowledgement** (files can be downloaded, remixed with or without credit and used by others; credit is tried but cannot be guaranteed; some remixes may not carry the label or link to the original) plus "I have the right to share it"; the **optional** "Made with AI" label; permission to host, show, translate, index and back up what members post; the three content tiers; warnings, notices, restrictions, suspension; **appeals** (decided by a reviewer other than the one involved; Creator decisions only to the Creator); deletion = disabled at once, erased after **30 days**, Creator can restore until then; the AI can be wrong and members must **not put private information into the hub AI**; the **official policy text is English and Chinese**; other languages are unofficial AI translations; daily upload limits exist and may change.

**Privacy Policy:** who runs it ("AOE Team") and the contact address; the AI free plan: member questions go to **Google** (on the free plan Google may use them and people may read them) and **Groq**, and the member cannot tell which one answered; text to be translated, and the name of a language a visitor asks for, also goes to Google/Groq; **retention table:** self-deleted and Creator-deleted accounts are both kept **30 days**, then the member's data, **warnings and the activity log about them are erased**; backups keep older copies up to a year (or shorten the weekly backups); files on the Internet Archive are public and permanent; **profile pictures are visible to anyone who can open the profile** (advise: do not use a photo of a child); cookies: sign-in and language cookie only, no trackers, **an information notice** (a lawyer decides if consent is legally required); rights: see, correct, delete, object, and **download my data**; postal address only if a US copyright agent is registered (a P.O. box is safer).

**Content Policy:** the three tiers and the allowed list above; profile pictures follow "No graphic, sexual, or adult content"; the reviewer test for the LGBTQ+ line above.

**Safety Policy:** the **urgent report** (goes to the top of every reviewer's list); how reports are handled; the **profile-picture report** (a reviewer looks first; only if it breaks the rule is the picture removed and the member asked to change it; otherwise dismissed); reviewers never handle reports about their own accounts; child-safety reporting where the law requires it (LAWYER); how evidence is kept (30 days).

**Community Policy, About, Contact, DMCA:** Community Policy = the short friendly version (welcome, the allowed list, the three tiers in plain words); About = "AOE Team" (how much more is still Clara's open decision, 11.11); Contact = the official email, with separate role addresses if she wants them (general, safety, copyright, privacy, appeals); DMCA = the **takedown form** (also usable by people without an account), a counter-notice step, a repeat-infringer rule, and, only if a US copyright agent is registered, the agent's real name and a (P.O. box) postal address (public).

**Footer / sign-up:** links to all policies; sign-up agreement; the cookie notice; each policy shows its **version** and date.

---

## 15. Build list: things still to be built because of these decisions [new]

**Step 7 (scanner, hosting, link-outs):**
1. ClamAV scanner (Cloud Run or small server); nothing downloadable until clean. Limits: ClamAV cannot scan a single file over about 4 GB; VirusTotal about 650 MB. **Clara to say the largest single file in her packs.**
2. **Upload limits as data:** default 100 files and 1 GB per member per day, changeable up or down by the Creator in the Creator panel without a code change, easy to reach, **per-member override**, the Creator's own account not capped (Clara is uploading large packs while testing).
3. **Big uploads:** direct-to-storage, resumable uploads (today the server rejects over 200 MB), and a **Creator bulk-import tool** run from Clara's computer from a folder.
4. Games/apps up to 50 MB hosted; larger as **link-outs** to approved sites only: GitHub, itch.io, Steam, the member's own site, Unity Play (list stored as editable data; a "you are leaving AOEhub" notice).
5. Upload form: the **acknowledgement checkbox** (wording above), the **optional "Made with AI"** checkbox on the upload and post forms, shown on the item.
6. **Reports:** a **takedown** form (public too), an **urgent report** (top of the reviewers' list), a **report-profile-picture** option in the report-user menu; routing by file or post to Creator/Watchers/Deacons as today.
7. **Appeals:** a member contests a warning, restriction or suspension from where they see it; the appeal goes to a reviewer other than the one who decided (Creator decisions to the Creator only).

**Step 8 (profile, password):**
8. **Profile pictures:** upload, re-save and scan, visible to anyone who can open the profile, reportable; on a confirmed violation the picture goes back to initials and the member gets the notice "please change your profile picture; it violated the hub content policy: No graphic, sexual, or adult content"; if the report is dismissed nothing is sent.
9. **Password reset** and security emails (needs a sending service, the hub's email address and DNS records).
10. **"Download my data"** (in Settings, made on the spot, nothing stored).

**Retention and housekeeping:**
11. **Evidence retention job:** both self-deleted and Creator-deleted accounts erased after 30 days, including the member's warnings and the activity log about them; needs the scheduler (the cron endpoints are not wired yet).
12. Remove translations when text is deleted (done), clean up old data (done).

**Step 6b (last):**
13. **Policy page shell and pages:** official English and Chinese (Simplified written by Clara; **Traditional converted automatically** and labelled so); a visitor in any other language sees English with a **"Translate into my language" button** (AI, labelled unofficial, English/Chinese counts); version and date on each page.
14. **Cookie information notice** (no third-party tool); footer and sign-up links; policy agreement at sign-up.
15. **Three welcome cards:** Exploring, In school, and one shared Homeschooling + Unschooling; each welcomes the member and says what the hub has (Experience Board, File Board, hub AI).
16. A visible **"don't put private information in the hub AI"** line in the AI chat box; AI-written message translations for system notifications (already translated by the content engine).

**Official email: `info@aoe.name` (given 2026-10-21; set in `src/lib/site.ts`; role addresses such as safety@ / copyright@ / privacy@ / appeals@ are optional aliases of it; sending password-reset email from it needs an email service and DNS records).** **Open items from Clara still needed:** **Clara's location (country/state) for the governing-law clause (Clara will supply it; it is listed here so it is not forgotten)**; About-page detail (11.11, Clara will decide when she writes the About page). **Settled 2026-10-20:** corporal-correction wording removed; Clara knows a single file over about 4 GB cannot be virus-scanned and will be careful (members: over-limit files are refused with a message to split them; the Creator bulk-import tool will mark Creator uploads as checked by the Creator).

---

## 16. Domains and build order (Clara, 2026-10-21)
- **`aoe.name` is the real, public hub domain** (and `info@aoe.name` its address). **`aoe.ai` is the TEST domain**: every version and every later update is first hosted on aoe.ai and tested on the website, a phone and an iPad; only after the tests pass is it put on aoe.name. Consequences to build in at the hosting step: both domains in Supabase sign-in redirect settings; the email service configured for both; **the test site must tell search engines not to index it**; the policy pages, footer and emails must use the right domain for where they run.
- **Clara's build order (2026-10-21):** upload form upgrades (done: Made-with-AI label, "Other", link-outs; next: optional preview picture or small video on files and on experience posts), game hosting, profile customization and password reset, takedown / urgent / appeals forms, "download my data", the 30-day purge job, the policy pages (English and Chinese, plus the AI translate button), the cookie notice, the three welcome cards, and **the scanner last**. The hub AI key pool (done) lets the Creator add keys without touching the settings file.
- **Not built, by Clara's decision:** a terminal in the Creator panel (security risk; changes to code go through GitHub).
- **Clara's full sequence (2026-10-21):** finish the build list (previews → game hosting → profile customization and password reset → takedown / urgent / appeals → download my data → 30-day purge → cookie notice and welcome cards) → **scanner** → **final wording and policy pages** → **domain and hosting (aoe.ai test, then aoe.name)** → testing and uploading the real files → **launch**. Clara creates the Creator account herself as the first step of testing, and a separate ordinary member account for uploads and posts.
- **Previews (decided 2026-10-21):** optional. File posts: up to 6 pictures and 2 videos (videos up to 5 minutes and 50 MB for now; they work like game trailers); experience posts: one picture. Pictures are re-saved as WebP (nothing but picture data survives); videos wait for the malware check. **Follow-up for the purge-job step:** when a member deletes their own post or file, the stored bytes are not removed from storage (only trash/Creator deletions are cleaned by the purge job); the purge job step must also clear these.
- **Staff panels in English and Simplified Chinese (Clara, 2026-10-21):** the Creator, Watcher and Deacon panels (today English only) get written in English and Simplified Chinese (Traditional by the converter), chosen by each person's language. To be done after game hosting and before the final wording step. Announcements, notices and the messages that warnings, removals and role changes send are already shown to each member in their own language by the content translation (machine-translated, original one click away).
- **Game hosting rules (built 2026-10-21):** hosted games ≤ 50 MB, one .zip with index.html at the top (or inside a single folder), self-contained (no outside links, no .exe/.php etc.), served only from the separate `play.` address inside a sandbox, only after the malware check passes; the same zip stays downloadable. Bigger games link out. DNS: one `play.` entry per domain (play.aoe.ai for testing, play.aoe.name for the public site), to be given to Clara at the hosting step.
- **Staff panels translated (2026-10-21):** Creator panel in English + Simplified Chinese (Traditional by converter) with a language switch at the top; Watcher and Deacon panels in every language the hub offers (their wording is built into the AI language builds; Creator-only wording is not). Messages that come from the database itself (some error texts) are still English.
- **Profile pictures and look, password reset (built 2026-10-21):** pictures are re-saved as a small square WebP, visible to anyone who can open the profile; a "Report this picture" link goes to the Creator, Watchers and Deacons, who look at it first; only if it breaks the content policy is it removed and the member sent a notice. Frame, background and post font are cosmetic and open to every account. Password reset: the email link works once and expires; the reset signs the person's other devices out; the "check your email" message is the same whether or not the email has an account. **Password reset and sign-up confirmation both need a real email service** (the hub's address `info@aoe.name` as sender; SPF/DKIM records on the domain) before real members can use them; the free built-in sender only reaches the team and only 2 messages an hour.
