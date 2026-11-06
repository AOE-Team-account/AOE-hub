// Data-access layer for the Experience Board — queries the real
// `experience_posts` and `comments` tables.

import { createClient } from "@/lib/supabase/server";
import type { ExperiencePost, Comment, BuzzKind, BuzzSource, VideoPlatform } from "@/lib/types";
import { mediaFor } from "./media";
import { nestComments, type CommentRow } from "./comments";

interface ExperiencePostRow {
  id: string;
  author_id: string;
  category: ExperiencePost["category"] | null;
  title: string | null;
  body: string;
  views: number;
  pinned: boolean;
  is_announcement: boolean;
  created_at: string;
  made_with_ai: boolean | null;
  board?: "experience" | "buzzora" | null;
  buzz_kind?: BuzzKind | null;
  country?: string | null;
  sources?: BuzzSource[] | null;
  is_ai?: boolean | null;
  link_url?: string | null;
  link_platform?: VideoPlatform | null;
}

function fromRow(row: ExperiencePostRow, replyCount: number): ExperiencePost {
  return {
    id: row.id,
    authorId: row.author_id,
    category: row.category ?? "just-sharing",
    title: row.title ?? undefined,
    body: row.body,
    views: row.views,
    replyCount,
    createdAt: row.created_at,
    pinned: row.pinned,
    isAnnouncement: row.is_announcement,
    madeWithAi: row.made_with_ai ?? false,
    board: row.board ?? "experience",
    buzzKind: row.buzz_kind ?? undefined,
    country: row.country ?? undefined,
    sources: Array.isArray(row.sources) ? row.sources : undefined,
    isAi: row.is_ai ?? false,
    linkUrl: row.link_url ?? undefined,
    linkPlatform: row.link_platform ?? undefined,
  };
}

async function replyCountsFor(postIds: string[]): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select("parent_id")
    .eq("parent_type", "experience-post")
    .in("parent_id", postIds);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.parent_id] = (counts[row.parent_id] ?? 0) + 1;
  }
  return counts;
}

export async function listExperiencePosts(): Promise<ExperiencePost[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("experience_posts")
    .select("*")
    .eq("board", "experience")
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as ExperiencePostRow[];
  const ids = rows.map((r) => r.id);
  const [counts, media] = await Promise.all([replyCountsFor(ids), mediaFor("experience", ids)]);
  return rows.map((row) => ({ ...fromRow(row, counts[row.id] ?? 0), imageId: media[row.id]?.find((m) => m.kind === "image")?.id }));
}

/** The Buzzora Board: newest first. Tabs and the country filter are applied in the page. */
export async function listBuzzoraPosts(): Promise<ExperiencePost[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("experience_posts").select("*").eq("board", "buzzora").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  const rows = (data ?? []) as ExperiencePostRow[];
  const counts = await replyCountsFor(rows.map((r) => r.id));
  return rows.map((row) => fromRow(row, counts[row.id] ?? 0));
}

export async function getExperiencePostById(id: string): Promise<ExperiencePost | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("experience_posts").select("*").eq("id", id).single();
  if (!data) return undefined;
  const [counts, media] = await Promise.all([replyCountsFor([id]), mediaFor("experience", [id])]);
  return { ...fromRow(data as ExperiencePostRow, counts[id] ?? 0), imageId: media[id]?.find((m) => m.kind === "image")?.id };
}

export async function listExperienceComments(postId: string): Promise<Comment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select("*")
    .eq("parent_type", "experience-post")
    .eq("parent_id", postId)
    .order("created_at", { ascending: true });

  return nestComments((data ?? []) as CommentRow[]);
}
