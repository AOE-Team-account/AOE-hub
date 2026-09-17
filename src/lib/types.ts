// Core domain types for AOEhub.
//
// Phase 1 note: these are the shapes the UI is built against. Phase 2
// (per the project roadmap) replaces src/lib/data/*.ts's in-memory
// implementations with real Supabase queries — these types should map
// closely onto that future Postgres schema, but nothing here is DB-specific.

export type LanguageCode = "en" | "zh-CN" | "zh-TW";

export type MediaType = "document" | "image" | "audio" | "video" | "game" | "app";

export type FileSection =
  | "curriculum"
  | "games"
  | "books"
  | "cards"
  | "songs"
  | "art"
  | "printables"
  | "apps";

export type Authorship = "original" | "remix" | "notmine";

export type ExperienceCategory =
  | "philosophy"
  | "starting-out"
  | "milestones"
  | "struggles"
  | "curriculum-reviews"
  | "reflections"
  | "just-sharing";

export type CommentType = "question" | "suggestion" | "sharing";

export type ReportReason =
  | "scam"
  | "off-topic"
  | "inappropriate"
  | "paywalled"
  | "copyright"
  | "other";

export type ReportTargetType = "file" | "experience-post" | "comment" | "group" | "user";

export type GroupVisibility = "public" | "private";

export interface User {
  id: string;
  name: string;
  displayName?: string;
  initials: string;
  isAdmin: boolean;
  memberSince: string; // ISO date
  points: number;
  followers: number;
  following: number;
  filesCount: number;
  groupsCount: number;
}

export type ScanStatus = "pending" | "clean" | "flagged";

export interface FileAsset {
  id: string;
  label: string;
  mimeType: string;
  downloads: number;
  scanStatus: ScanStatus;
  sizeBytes: number | null;
}

export interface FilePost {
  id: string;
  title: string;
  description: string;
  section: FileSection;
  mediaType: MediaType;
  authorship: Authorship;
  remixOfPostId?: string;
  authorId: string;
  views: number;
  createdAt: string;
  updatedAt?: string;
  assets: FileAsset[];
}

export interface Comment {
  id: string;
  parentType: "file" | "experience-post" | "group";
  parentId: string;
  authorId: string;
  type: CommentType;
  body: string;
  createdAt: string;
  replies?: Comment[];
}

export interface ExperiencePost {
  id: string;
  authorId: string;
  category: ExperienceCategory;
  title?: string;
  body: string;
  views: number;
  replyCount: number;
  createdAt: string;
  pinned?: boolean;
  isAnnouncement?: boolean;
}

export interface Group {
  id: string;
  name: string;
  description: string;
  visibility: GroupVisibility;
  memberCount: number;
  createdAt: string;
  reported?: boolean;
}

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
  createdAt: string;
  status: "open" | "dismissed" | "resolved";
}

export interface NotificationItem {
  id: string;
  body: string;
  createdAt: string;
  read: boolean;
}
