// Shared helper for file.ts and experience.ts: comments are stored flat
// (self-referencing parent_comment_id) but the UI (Discussion.tsx) expects
// one level of nested `replies`, matching the prototype's shape.

import type { Comment } from "@/lib/types";

export interface CommentRow {
  id: string;
  parent_type: Comment["parentType"];
  parent_id: string;
  parent_comment_id: string | null;
  author_id: string;
  type: Comment["type"];
  body: string;
  created_at: string;
}

export function nestComments(rows: CommentRow[]): Comment[] {
  const byId = new Map<string, Comment>();
  const roots: Comment[] = [];

  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      parentType: row.parent_type,
      parentId: row.parent_id,
      authorId: row.author_id,
      type: row.type,
      body: row.body,
      createdAt: row.created_at,
    });
  }

  for (const row of rows) {
    const comment = byId.get(row.id)!;
    if (row.parent_comment_id && byId.has(row.parent_comment_id)) {
      const parent = byId.get(row.parent_comment_id)!;
      parent.replies = [...(parent.replies ?? []), comment];
    } else {
      roots.push(comment);
    }
  }

  return roots;
}
