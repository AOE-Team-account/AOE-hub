// Data-access layer for the Experience Board. Phase 1: reads from in-memory
// mock data. Phase 2: swap these bodies for Supabase queries — call sites
// elsewhere in the app don't need to change.

import { EXPERIENCE_POSTS, getExperiencePost as getMockPost, getCommentsFor } from "@/lib/mock-data";
import type { ExperiencePost, Comment } from "@/lib/types";

export async function listExperiencePosts(): Promise<ExperiencePost[]> {
  return [...EXPERIENCE_POSTS].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function getExperiencePostById(id: string): Promise<ExperiencePost | undefined> {
  return getMockPost(id);
}

export async function listExperienceComments(postId: string): Promise<Comment[]> {
  return getCommentsFor("experience-post", postId);
}
