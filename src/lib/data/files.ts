// Data-access layer for the File Board. Phase 1: in-memory mock data.
// Phase 2: swap for Supabase (+ R2 / Internet Archive asset URLs).

import { FILE_POSTS, getFilePost as getMockFile, getCommentsFor } from "@/lib/mock-data";
import type { FilePost, Comment } from "@/lib/types";

export async function listFilePosts(): Promise<FilePost[]> {
  return [...FILE_POSTS].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getFilePostById(id: string): Promise<FilePost | undefined> {
  return getMockFile(id);
}

export async function listFileComments(fileId: string): Promise<Comment[]> {
  return getCommentsFor("file", fileId);
}
