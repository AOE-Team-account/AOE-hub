import "server-only";

// Built-in knowledge so the assistant can explain how the hub itself works.
// Kept in sync with the project's product decisions (access
// model, languages). Indexed like any other document.

export const HUB_GUIDE_SOURCE_ID = "00000000-0000-4000-8000-0000000a0e01";
export const HUB_GUIDE_TITLE = "How AOEhub works";

export const HUB_GUIDE_TEXT = `AOEhub (Alpha Omega Education) is a free education hub for homeschool, unschool, and school families. It has three boards: the AOE Experience Board, the File Board and the Buzzora Board. They are free to join and use. A marketplace for buying and selling educational materials may be added in the future.

File Board: free curriculum, books, cards, games, printables, songs, art projects and apps. Anyone signed in can upload, download and remix. One upload post can hold several files (for example different language versions), each with its own label and download button. Every uploaded file is scanned for malware before it can be downloaded; a file that is still being scanned shows as scanning, and a flagged file is removed.

AOE Experience Board: real stories and philosophy discussion in one place. There is no separate philosophy tab; use the Philosophy tag to filter for it. Anyone can post philosophy content. The board is shown in chronological order, not ranked by popularity. Its Videos tag holds links to educational videos on YouTube, bilibili, TikTok, 小红书, WeChat and Facebook; the videos stay on those platforms and are never hosted on AOEhub. Some are chosen daily by AI for their educational value and for ideas similar to the hub's philosophy books; others are added by the AOEhub team.

Buzzora Board: news, laws and regulations about homeschooling and unschooling around the world, in three tabs (News, Law, Regulation) with a country filter. Its posts are AI-collected summaries from government sites and major news outlets, each with links to its sources and a note on what is only a proposal and what is already in force; they are information, not legal advice. Only the AOEhub team and the hub's daily AI job post there; members can read, comment and report.

Logged-out visitors can browse and read all three boards. Downloading, posting, commenting, remixing, following and reporting all need a free account.

Replies: under every comment there is a Reply link. Signed-in members who can comment can reply; replies sit under the comment they answer (one level, so conversations stay easy to read).

Authorship: every upload is marked Original, Remix, or Not my work. A remix links back to the original creator automatically.

Badges: a small A next to a name marks an Answerer (their answers are carefully chosen and pinned to the top) and a small V marks a Verified member (the hub's Creator agrees with their ideas; their comments are highlighted). Verified members can pin one post and one file to a "From verified voices" section at the top of each board. Nobody else's role is ever shown.

Trust and safety: a small team moderates the hub. Every file, post and comment has a Report button with structured reasons (scam or money request, off-topic, inappropriate content, paywalled or costs money, copyright or not their work, something else). The team reviews reports before acting. Warnings are private: each one has a level (green, yellow or red) set by its reason, and repeated warnings lead to a one-week restriction on posting, uploading and commenting; a reviewer can also add a notice above a post that names only the kind of reviewer, never the person. Content that breaks the rules is removed and the member is told privately. The hub works hard to prevent scams but cannot guarantee that none will happen, and it takes no responsibility for one member scamming another.

Languages: the hub is available in English, Simplified Chinese and Traditional Chinese. Post titles, descriptions and comments have a Translate button. Downloaded file contents are never translated.

Settings: appearance (light or dark and 15 color themes), four text sizes, language, and notifications. Members can also add their own AI API key in Settings so the assistant uses their key instead of the hub's default.

The assistant (this chat) only searches AOEhub: it answers questions about the hub and about education, suggests content, explains what a file or post is about, and answers philosophy questions using the hub's own philosophy books and posts. For anything else (politics, general questions that are not about education, or tasks such as making worksheets or writing texts) it points to other AI assistants. When it cannot answer a question confidently, it says so and offers to post the question on the AOE Experience Board under the member's own name, in the Question category. Verified members and Answerers are told a question needs an answer, the asker is told about every answer, and answers from Verified members and Answerers can help the assistant answer the same question later (deleting an answer removes it from what the assistant knows).`;
