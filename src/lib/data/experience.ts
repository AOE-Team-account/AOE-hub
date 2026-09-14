// Data-access layer for the Experience Board — queries the real
// `experience_posts` and `comments` tables.

import { createClient } from "@/lib/supabase/server";
import type { ExperiencePost, Comment } from "@/lib/types";
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
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as ExperiencePostRow[];
  const counts = await replyCountsFor(rows.map((r) => r.id));
  return rows.map((row) => fromRow(row, counts[row.id] ?? 0));
}

export async function getExperiencePostById(id: string): Promise<ExperiencePost | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("experience_posts").select("*").eq("id", id).single();
  if (!data) return undefined;
  const counts = await replyCountsFor([id]);
  return fromRow(data as ExperiencePostRow, counts[id] ?? 0);
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
