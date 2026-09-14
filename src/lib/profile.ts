import type { User } from "./types";

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Row shape from the `profiles` table (see supabase/schema.sql).
export interface ProfileRow {
  id: string;
  name: string;
  display_name: string | null;
  is_admin: boolean;
  member_since: string;
  points: number;
  followers_count: number;
  following_count: number;
  files_count: number;
  groups_count: number;
}

export function userFromProfileRow(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    initials: initialsFromName(row.display_name || row.name),
    isAdmin: row.is_admin,
    memberSince: row.member_since,
    points: row.points,
    followers: row.followers_count,
    following: row.following_count,
    filesCount: row.files_count,
    groupsCount: row.groups_count,
  };
}
