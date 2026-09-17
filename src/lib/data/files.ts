// Data-access layer for the File Board — queries the real `file_posts` /
// `file_assets` / `comments` tables.

import { createClient } from "@/lib/supabase/server";
import type { FilePost, FileAsset, Comment } from "@/lib/types";
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
}

interface FileAssetRow {
  id: string;
  file_post_id: string;
  label: string;
  mime_type: string | null;
  downloads: number;
  scan_status: FileAsset["scanStatus"];
  size_bytes: number | null;
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
    };
    byPost[row.file_post_id] = [...(byPost[row.file_post_id] ?? []), asset];
  }
  return byPost;
}

export async function listFilePosts(): Promise<FilePost[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("file_posts").select("*").order("created_at", { ascending: false });

  const rows = (data ?? []) as FilePostRow[];
  const assets = await assetsFor(rows.map((r) => r.id));
  return rows.map((row) => fromRow(row, assets[row.id] ?? []));
}

export async function getFilePostById(id: string): Promise<FilePost | undefined> {
  const supabase = await createClient();
  const { data } = await supabase.from("file_posts").select("*").eq("id", id).single();
  if (!data) return undefined;
  const assets = await assetsFor([id]);
  return fromRow(data as FilePostRow, assets[id] ?? []);
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
