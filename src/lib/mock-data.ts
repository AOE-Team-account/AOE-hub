// In-memory sample content, ported from hub-prototype.html, standing in for
// the real database. Phase 2 replaces the functions in src/lib/data/*.ts
// with real Supabase queries — nothing outside that folder should import
// this file directly.

import type {
  AdminReport,
  Comment,
  ExperiencePost,
  FilePost,
  Group,
  NotificationItem,
  User,
} from "./types";

export const CURRENT_USER_ID = "u-sarah";

export const USERS: User[] = [
  { id: "u-sarah", name: "Sarah M.", initials: "SM", isAdmin: false, memberSince: "2025-03-01", points: 1842, followers: 312, following: 48, filesCount: 6, groupsCount: 2 },
  { id: "u-david", name: "David K.", initials: "DK", isAdmin: false, memberSince: "2025-05-14", points: 210, followers: 18, following: 12, filesCount: 2, groupsCount: 1 },
  { id: "u-lin", name: "Lin H.", initials: "LH", isAdmin: false, memberSince: "2024-11-02", points: 960, followers: 140, following: 60, filesCount: 1, groupsCount: 3 },
  { id: "u-grace", name: "Grace W.", initials: "GW", isAdmin: false, memberSince: "2025-01-20", points: 540, followers: 75, following: 30, filesCount: 0, groupsCount: 2 },
  { id: "u-maria", name: "Maria T.", initials: "MT", isAdmin: false, memberSince: "2025-06-11", points: 320, followers: 40, following: 22, filesCount: 0, groupsCount: 1 },
  { id: "u-owen", name: "Owen P.", initials: "OP", isAdmin: true, memberSince: "2024-01-01", points: 3100, followers: 512, following: 10, filesCount: 12, groupsCount: 4 },
  { id: "u-jamie", name: "Jamie R.", initials: "JR", isAdmin: false, memberSince: "2025-08-03", points: 60, followers: 4, following: 15, filesCount: 0, groupsCount: 0 },
  { id: "u-priya", name: "Priya N.", initials: "PN", isAdmin: false, memberSince: "2025-08-15", points: 90, followers: 6, following: 9, filesCount: 0, groupsCount: 1 },
  { id: "u-jordan", name: "Jordan B.", initials: "JB", isAdmin: false, memberSince: "2026-01-05", points: 5, followers: 0, following: 1, filesCount: 0, groupsCount: 1 },
];

export function getUserById(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export const EXPERIENCE_POSTS: ExperiencePost[] = [
  {
    id: "e-remix-announcement",
    authorId: "u-owen",
    category: "philosophy",
    title: "Remix attribution is now live",
    body: "You can now remix any file on the board — the original creator is linked automatically.",
    views: 0,
    replyCount: 0,
    createdAt: "2026-09-05T00:00:00Z",
    pinned: true,
    isAnnouncement: true,
  },
  {
    id: "e-lin-formation",
    authorId: "u-lin",
    category: "philosophy",
    title: "On formation, not just information",
    body: "\"Education is an atmosphere, a discipline, a life.\" Charlotte Mason's words changed how I think about our homeschool days — not lessons to check off, but a way of living together.",
    views: 218,
    replyCount: 42,
    createdAt: "2026-08-28T00:00:00Z",
  },
  {
    id: "e-grace-narration",
    authorId: "u-grace",
    category: "philosophy",
    title: "Why we stopped grading narration",
    body: "A reflection on separating assessment from genuine understanding, and what changed for our family once we let go of grades entirely.",
    views: 96,
    replyCount: 15,
    createdAt: "2026-09-04T00:00:00Z",
  },
  {
    id: "e-maria-yearoff",
    authorId: "u-maria",
    category: "reflections",
    body: "We took a full year off \"formal\" lessons and just read together every day. I was terrified. It turned out to be the best decision — she reads three grade levels ahead now.",
    views: 340,
    replyCount: 18,
    createdAt: "2026-09-06T00:00:00Z",
  },
  {
    id: "e-owen-curriculum",
    authorId: "u-owen",
    category: "starting-out",
    body: "Something I wish I knew starting out: the curriculum matters less than you think. The relationship you build around learning matters more.",
    views: 512,
    replyCount: 31,
    createdAt: "2026-09-04T00:00:00Z",
  },
];

export function getExperiencePosts(): ExperiencePost[] {
  return [...EXPERIENCE_POSTS].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function getExperiencePost(id: string): ExperiencePost | undefined {
  return EXPERIENCE_POSTS.find((p) => p.id === id);
}

export const FILE_POSTS: FilePost[] = [
  {
    id: "f-phonics",
    title: "Early reading phonics workbook, weeks 1-8",
    description:
      "A gentle, low-pressure phonics sequence I built for my daughter when she was 5. Short daily lessons, no worksheets she'd dread. Posted in three language versions below.",
    section: "curriculum",
    mediaType: "document",
    authorship: "original",
    authorId: "u-sarah",
    views: 2140,
    createdAt: "2026-08-21T00:00:00Z",
    assets: [
      { id: "a-phonics-en", label: "English version", mimeType: "application/pdf", downloads: 210 },
      { id: "a-phonics-zhtw", label: "繁體中文版 · Traditional Chinese", mimeType: "application/pdf", downloads: 96 },
      { id: "a-phonics-zhcn", label: "简体中文版 · Simplified Chinese", mimeType: "application/pdf", downloads: 134 },
    ],
  },
  {
    id: "f-songs",
    title: "Phonics songs & read-along video, set 1",
    description: "Remixed from Sarah M.'s workbook — added a read-along video for auditory learners.",
    section: "songs",
    mediaType: "video",
    authorship: "remix",
    remixOfPostId: "f-phonics",
    authorId: "u-david",
    views: 410,
    createdAt: "2026-09-07T00:00:00Z",
    assets: [{ id: "a-songs-1", label: "Read-along video", mimeType: "video/mp4", downloads: 88 }],
  },
];

export function getFilePosts(): FilePost[] {
  return [...FILE_POSTS].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getFilePost(id: string): FilePost | undefined {
  return FILE_POSTS.find((f) => f.id === id);
}

export const COMMENTS: Comment[] = [
  {
    id: "c-jamie-phonics",
    parentType: "file",
    parentId: "f-phonics",
    authorId: "u-jamie",
    type: "question",
    body: "Did this work for a kid who already knows most letter sounds?",
    createdAt: "2026-09-09T00:00:00Z",
    replies: [
      {
        id: "c-sarah-reply",
        parentType: "file",
        parentId: "f-phonics",
        authorId: "u-sarah",
        type: "sharing",
        body: "Yes, we started around week 4 for that reason. Feel free to skip ahead.",
        createdAt: "2026-09-09T12:00:00Z",
      },
    ],
  },
  {
    id: "c-lin-maria",
    parentType: "experience-post",
    parentId: "e-maria-yearoff",
    authorId: "u-lin",
    type: "question",
    body: "Did the reading time replace math too, or just the \"formal\" part?",
    createdAt: "2026-09-07T00:00:00Z",
  },
  {
    id: "c-priya-maria",
    parentType: "experience-post",
    parentId: "e-maria-yearoff",
    authorId: "u-priya",
    type: "sharing",
    body: "This is exactly what I needed to read today. Thank you for being honest about it.",
    createdAt: "2026-09-08T00:00:00Z",
  },
];

export function getCommentsFor(parentType: Comment["parentType"], parentId: string): Comment[] {
  return COMMENTS.filter((c) => c.parentType === parentType && c.parentId === parentId);
}

export const GROUPS: Group[] = [
  { id: "g-charlotte-mason", name: "Charlotte Mason study circle", description: "Reading and discussing Mason's volumes together, one chapter at a time.", visibility: "private", memberCount: 24, createdAt: "2025-11-01T00:00:00Z" },
  { id: "g-special-needs", name: "Special needs homeschool support", description: "A space for families adapting curriculum and routines for kids with different needs.", visibility: "public", memberCount: 61, createdAt: "2025-09-15T00:00:00Z" },
  { id: "g-coop-meetup", name: "Homeschool co-op meetup", description: "Local meetup coordination.", visibility: "public", memberCount: 8, createdAt: "2026-08-01T00:00:00Z", reported: true },
];

export function getGroups(): Group[] {
  return GROUPS;
}

export const ADMIN_REPORTS: AdminReport[] = [
  { id: "r-1", targetType: "group", targetId: "g-coop-meetup", reason: "scam", details: "Post in \"Homeschool co-op meetup\" group asking members to send payment for \"guaranteed curriculum access.\"", createdAt: "2026-09-11T14:00:00Z", status: "open" },
  { id: "r-2", targetType: "file", targetId: "f-songs", reason: "off-topic", details: "File upload unrelated to education or homeschooling.", createdAt: "2026-09-10T09:00:00Z", status: "open" },
];

export function getOpenAdminReports(): AdminReport[] {
  return ADMIN_REPORTS.filter((r) => r.status === "open");
}

export const NOTIFICATIONS: NotificationItem[] = [
  { id: "n-1", body: "Sarah M., who you follow, posted a new file: \"Nature journal template\"", createdAt: "2026-09-11T10:00:00Z", read: false },
  { id: "n-2", body: "Jamie R. asked a question on your phonics workbook", createdAt: "2026-09-09T00:00:00Z", read: false },
  { id: "n-3", body: "Owen P. replied to your comment in the Experience Board", createdAt: "2026-09-08T00:00:00Z", read: true },
];

export function getNotifications(): NotificationItem[] {
  return NOTIFICATIONS;
}
