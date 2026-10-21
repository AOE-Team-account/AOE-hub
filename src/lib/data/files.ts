// Data-access layer for the File Board — queries the real `file_posts` /
// `file_assets` / `comments` tables.

import { createClient } from "@/lib/supabase/server";
import type { FilePost, FileAsset, Comment } from "@/lib/types";
import { mediaFor } from "./media";
import { nestComments, type CommentRow } from "./comments";

interface FilePostRow {
  id: string;
  author_id: string;
  title: string;
  description: string;
  section: FilePost["section"];
  media_type: FilePost["mediaType"];
  authorship: FilePost["authorship"];
  remix_of_post_id: string | null;
  views: number;
  created_at: string;
  updated_at: string | null;
  made_with_ai: boolean | null;
}

interface FileAssetRow {
  id: string;
  file_post_id: string;
  label: string;
  mime_type: string | null;
  downloads: number;
  scan_status: FileAsset["scanStatus"];
  size_bytes: number | null;
  is_link: boolean | null;
  link_url: string | null;
  is_game: boolean | null;
}

function fromRow(row: FilePostRow, assets: FileAsset[]): FilePost {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    section: row.section,
    mediaType: row.media_type,
    authorship: row.authorship,
    remixOfPostId: row.remix_of_post_id ?? undefined,
    authorId: row.author_id,
    views: row.views,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    assets,
    madeWithAi: row.made_with_ai ?? false,
  };
}

async function assetsFor(postIds: string[]): Promise<Record<string, FileAsset[]>> {
  if (postIds.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase.from("file_assets").select("*").in("file_post_id", postIds);

  const byPost: Record<string, FileAsset[]> = {};
  for (const row of (data ?? []) as FileAssetRow[]) {
    const asset: FileAsset = {
      id: row.id,
      label: row.label,
      mimeType: row.mime_type ?? "",
      downloads: row.downloads,
      scanStatus: row.scan_status,
      sizeBytes: row.size_bytes,
      isLink: row.is_link ?? false,
      linkUrl: row.link_url ?? undefined,
      isGame: row.is_game ?? false,
    };
    byPost[row.file_post_id] = [...(byPost[row.file_post_id] ?? []), asset];
  }
  return byPost;
}

export async function listFilePosts(): Promise<FilePost[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("file_posts").select("*").order("created_at", { ascending: false });

  const rows = (data ?? []) as FilePostRow[];
  const ids = rows.map((r) => r.id);
  const [assets, media] = await Promise.all([assetsFor(ids), mediaFor("file", ids)]);
  return rows.map((row) => ({ ...fromRow(row, assets[row.id] ?? []), media: media[row.id] ?? [] }));
}

export async function getFilePostById(id: string): Promise<FilePost | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("file_posts").select("*").eq("id", id).single();
  if (!data) return undefined;
  const [assets, media] = await Promise.all([assetsFor([id]), mediaFor("file", [id])]);
  return { ...fromRow(data as FilePostRow, assets[id] ?? []), media: media[id] ?? [] };
}

export async function listFileComments(fileId: string): Promise<Comment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select("*")
    .eq("parent_type", "file")
    .eq("parent_id", fileId)
    .order("created_at", { ascending: true });

  return nestComments((data ?? []) as CommentRow[]);
}
