# AOEhub: wording to finish (marketing page, other drafts, placeholders)

Written 2026-10-23. Rule from Clara: at launch there must be **no placeholders or draft wording anywhere except the policies and the About page** (Contact is done: info@aoe.name). Send me the final text for each item below, in English and Simplified Chinese (or English only and I will write the Chinese for you to review). Traditional Chinese is converted automatically.

## 1. Marketing page (the page visitors see at "/", before signing in)

In the order it appears on the page. The headline accepts a line break (`<br />`). In the Experience Board paragraph the `<note>…</note>` parts are small grey side notes.

| Key | English | 简体中文 |
|---|---|---|
| `landing.eyebrow` | AOEhub (Alpha Omega Education) — for homeschool, unschool, and school families alike | AOEhub（Alpha Omega Education）— 无论在家自学、非学校教育还是学校教育的家庭都欢迎 |
| `landing.h1` | Education isn't something you copy.<br />It's something you walk. | 教育不是用来复制的。<br />它是用来走的路。 |
| `landing.subhead` | A free home for the philosophy, the honest experience, and the curriculum behind education — shared by families who started the walk before you, for families just starting now. | 一个免费的家园，分享关于教育的理念、真实的经验和课程 —— 由先走过这条路的家庭分享给刚刚开始的家庭。 |
| `landing.signupFree` | Sign up free | 免费注册 |
| `landing.logIn` | Log in | 登录 |
| `landing.browsePre` | Or just | 或者直接 |
| `landing.browseLink` | browse the File Board | 浏览资源板 |
| `landing.browsePost` |  and the Experience Board — no account needed to look around. | 和经验分享板 —— 无需账号即可查看。 |
| `landing.signupPre` | Want to download a file, post something, or leave a comment? | 想下载文件、发布内容或留言吗？ |
| `landing.signupStrong` | Sign up or log in — it's free. | 免费注册或登录。 |
| `landing.pullquote` | "Education is an atmosphere, a discipline, and a life." | "教育是一种氛围、一种纪律、一种生活。" |
| `landing.taglineSmall` | The Experience Board and File Board are always free · Built by those who've walked this path, are walking it now, and are just starting. | 经验分享板和资源板永远免费 · 由走过这条路、正在走这条路、刚刚开始这条路的人共同建立。 |
| `landing.marketplaceNote` | Heads-up: we plan to add a marketplace in a later update, where members can buy and sell. The Experience Board and File Board will stay free. We work hard to prevent scams, but we can't guarantee none will happen. | 提前告知：我们计划在之后的更新中加入一个市场，成员可以在其中买卖商品。经验分享板和资源板将继续免费。我们会尽力防范诈骗，但无法保证绝不发生。 |
| `landing.expEyebrow` | Experience Board | 经验分享板 |
| `landing.expTitle` | Real stories, and the philosophy behind them | 真实的故事，以及背后的理念 |
| `landing.expDesc` | What worked, what didn't, and what they'd do differently — plus honest reflections on why we educate at all, from the Bible, Charlotte Mason <note>(a 19th-century educator known for her living-books, nature-study approach)</note>, Karl Witte <note>(a 19th-century writer known for his early-education philosophy)</note>, and everyone here who has their own thoughts to share. This isn't just the founders' philosophy — it's everybody's, filed under its own tag so it's easy to find. | 什么有效、什么无效、以及他们会怎样改变做法——还有对我们为什么要教育的真诚思考，来自圣经、夏洛特·梅森<note>（19世纪教育家，以“活书”和自然观察教学法闻名）</note>、卡尔·威特<note>（19世纪作家，以早期教育理念闻名）</note>，以及这里每一位愿意分享想法的人。这不只是创办人的理念，而是大家的理念，并归在专门的标签下，方便查找。 |
| `landing.fileEyebrow` | File Board | 资源板 |
| `landing.fileTitle` | Free curriculum, books, cards, games, and printables | 免费的课程、书籍、卡片、游戏和可打印资料 |
| `landing.fileDesc` | Download, use, and remix anything — always at no cost, and always credited back to whoever made it first. | 下载、使用和改编任何内容——永远免费，并始终标明最初的创作者。 |
### Browser tab title and search-engine description (page head)

- Title: **AOEhub — Alpha Omega Education**
- Description: *A free education hub for homeschool, unschool, and school families: real experience, shared philosophy, and free curriculum.*

(English only for now; these are not translated.)

### The page that opens when a visitor tries to download, post, comment…

| Key | English | 简体中文 |
|---|---|---|
| `signin.title` | Sign in to continue | 请登录后继续 |
| `signin.body` | Browsing is always free. Downloading, posting, uploading, remixing, commenting, following, and reporting need an account. | 浏览永远免费。下载、发布、上传、改编、评论、关注和举报需要账号。 |
| `signup.freeLine` | Free, always — the Experience Board and File Board. | 永远免费——经验分享板和资源板。 |
| `login.newHere` | New here? | 第一次来？ |
| `signup.haveAccount` | Already have an account? | 已有账号？ |
## 2. Other wording that is still a draft

1. **Reasons reviewers choose from** (what a member is told, and which warning level each sets). Live in the database; listed in `supabase/schema.sql` near "moderation_reasons":
   - Scam or asking for money (red) · Harmful ideology or harmful content (red) · Inappropriate content (red) · Child-safety concern (red) · **Wrong ideas (as defined in the content policy)** (yellow, wording not final) · Ads or self-promotion (yellow) · Paywalled or costs money (yellow) · Copyright — not their work (yellow) · Off-topic / not education related (green) · Something else (delete only)
   - **Dismissal reasons marked DRAFT:** "No rule was broken", "Already handled", "The report was a mistake".
   - Levels marked "assumed": Inappropriate content, Paywalled, Copyright.
   - Decision for you: the new Content Policy has ladders (permanent ban / warning / notice only). Should these reasons be renamed to match it (for example "Sexual or adult content", "Hate or violence", "Cult or extremism", "Promoting LGBTQ+ ideas to children", "Undermining parental authority")?
2. **Rules for reviewers** (the 7 rules in the Watcher and Deacon panels, marked "a draft the Creator edits"):

| Key | English | 简体中文 |
|---|---|---|
| `staff.rules.title` | Rules for reviewers | 审核人员守则 |
| `staff.rules.r1` | Every action needs a reason from the fixed list: delete, warn, dismiss and notice. No reason, no action. | 每一次操作都必须从固定列表中选择原因：删除、警告、驳回和提示。没有原因，就不能操作。 |
| `staff.rules.r2` | The reason sets the warning level. You cannot pick or change the level. | 原因决定警告级别。您不能自行选择或修改级别。 |
| `staff.rules.r3` | Counts, restrictions and reports follow the fixed thresholds and cannot be skipped or forced. | 次数、限制和上报都遵循固定的门槛，不能跳过或强制执行。 |
| `staff.rules.r4` | Only the Creator deletes accounts, undoes warnings, or changes a notice the Creator added. | 只有 Creator 可以删除账号、撤销警告，或修改 Creator 添加的提示。 |
| `staff.rules.r5` | No self-review: you cannot act on your own posts, comments or files. Another reviewer will. | 不得自我审核：您不能处理自己的帖子、评论或文件，将由其他审核人员处理。 |
| `staff.rules.r6` | Everything you do is recorded with your name and the time, and kept as evidence. Misuse can cost you the role. | 您的所有操作都会连同姓名和时间被记录，并作为证据保存。滥用权限可能会失去该角色。 |
| `staff.rules.r7` | Deleting is never final: the Creator can restore anything. | 删除并非最终决定：Creator 可以恢复任何内容。 |
3. **Onboarding questions, welcome cards and the AI-key section**: final (written by you, 2026-10-23). Only the small hint under the region question ("This only decides which free AI services we suggest…") and the intro line are mine:

| Key | English | 简体中文 |
|---|---|---|
| `onboarding.welcome` | Welcome to AOEhub | 欢迎来到 AOEhub |
| `onboarding.intro` | One quick question is required; the rest are optional and just help us show you the right things first. | 有一个简单的问题是必答的；其余都是可选的，只是帮助我们先向您展示合适的内容。 |
| `onboarding.regionHint` | This only decides which free AI services we suggest to you. You can change it any time in Settings. It is your choice, so we don't check it. | 这只决定我们为您推荐哪些免费 AI 服务。您可以随时在设置中更改。由您自己选择，我们不会核实。 |
| `onboarding.regionError` | Please choose one of the two to continue. | 请在两项中选择一项后继续。 |
4. **Hub AI greeting and name** (the round button):

| Key | English | 简体中文 |
|---|---|---|
| `ai.title` | Ask the hub AI | 向站内 AI 提问 |
| `ai.greeting` | Hi! I can help you find files, point you to a philosophy idea, or explain how something on the hub works. What are you looking for? | 您好！我可以帮您找资源、介绍站内的理念，或者解释本站的某个功能。您想找什么？ |
| `ai.placeholder` | Ask a question... | 请输入问题…… |
5. **The message a suspended or deleted member sees** and the "contact us" sentence:

| Key | English | 简体中文 |
|---|---|---|
| `login.banned` | This account is suspended or has been deleted. | 此账号已被暂停或已被删除。 |
| `contact.mistakeWithEmail` | If you think this is a mistake, contact us at {email}. | 如果您认为这是个误会，请通过 {email} 联系我们。 |
6. **Terms acceptance record.** The database still records acceptance of "draft-1" versions of Terms, Content and Safety. When the policies are final I will change this to the final version numbers (my job, no wording needed from you).
7. **Sign-up confirmation email and password-reset email** (written in the Supabase email templates, not in the hub). Final wording needed when Brevo is set up.
8. **Error messages from the database** (for example "You already…") are still in English for every language; translating the common ones is on my list.
9. **Everything else on the site**: all 940+ interface texts, in English and Chinese, are in the second file (`AOEhub all interface wording.md`). Read it when you want to polish any of them.

## 3. Placeholders inside the policy pages (these are allowed to remain until the final policy text)

**about** (1)
- How much to say about who is behind the hub.

**community** (0)
- none

**contact** (1)
- Separate role addresses, for example for safety, copyright and privacy, if you want them.

**content-policy** (0)
- none

**copyright** (2)
- The counter-notice steps: how a member can answer a takedown notice, and what happens next. Lawyer.
- The rule for members who repeatedly post work they have no right to share. Lawyer.

**privacy** (4)
- double brackets
- Add any service added later.
- Lawyer: rights under the laws that apply to your members.
- Lawyer: whether a consent banner is needed.

**safety** (1)
- Lawyer: duties to report to the authorities and how such material must be handled.

**terms** (4)
- double brackets
- Operator name and address, only if a law or registration needs them.
- Lawyer: disclaimer and limit of liability.
- Which country or state's law applies to disputes between you and the hub, and which courts. Lawyer.

