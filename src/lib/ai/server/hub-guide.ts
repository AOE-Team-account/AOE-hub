import "server-only";

// Built-in knowledge so the assistant can explain how the hub itself works.
// Kept in sync with the project's product decisions (points formula, access
// model, groups, languages). Indexed like any other document.

export const HUB_GUIDE_SOURCE_ID = "00000000-0000-4000-8000-0000000a0e01";
export const HUB_GUIDE_TITLE = "How AOEhub works";

export const HUB_GUIDE_TEXT = `AOEhub (Alpha Omega Education) is a free education hub for homeschool, unschool, and school families. It has three spaces: the File Board, the Experience Board, and Groups.

File Board: free curriculum, books, cards, games, printables, songs, art projects and apps. Anyone signed in can upload, download and remix. One upload post can hold several files (for example different language versions), each with its own label and download button. Every uploaded file is scanned for malware before it can be downloaded; a file that is still being scanned shows as scanning, and a flagged file is removed.

Experience Board: real stories and philosophy discussion in one place. There is no separate philosophy tab; use the Philosophy tag to filter for it. Anyone can post philosophy content. The board is shown in chronological order, not ranked by popularity.

Groups: public groups can be searched and joined; private groups are invite-only and hidden from non-members. Private groups are still visible to admins for moderation. Groups never earn points.

Logged-out visitors can browse and read the File Board and Experience Board. Downloading, posting, commenting, remixing, following, reporting and joining groups all need a free account.

Points: 1 point per view (counted once per person per day), 5 points per download, 3 points per comment or question left on your post, and 10 points per remix of your file. You earn points only from File Board and Experience Board activity, never from your own views, downloads or comments on your own content, and never from groups. Search ranking uses a log-compressed version of points so one huge hit does not bury newer good content; your profile total is the plain honest sum.

Authorship: every upload is marked Original, Remix, or Not my work. A remix links back to the original creator automatically.

Trust and safety: there are four admins. Every file, post, comment and group has a Report button with structured reasons (scam or money request, off-topic, inappropriate content, paywalled or costs money, copyright or not their work, something else). Admins review reports before acting. The hub takes no responsibility for one member scamming another. Confirmed scams are removed and publicly announced by the admins.

Languages: the hub is available in English, Simplified Chinese and Traditional Chinese. Post titles, descriptions and comments have a Translate button. Downloaded file contents are never translated.

Settings: appearance (light or dark and 15 color themes), four text sizes, language, and notifications. Members can also add their own AI API key in Settings so the assistant uses their key instead of the hub's default.

The assistant (this chat) answers general questions, suggests content, explains what a file or post is about, and answers philosophy questions using the hub's own philosophy books and posts. Questions it cannot answer confidently can be sent to the admins.`;
