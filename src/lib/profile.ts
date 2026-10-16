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
  member_since: string;
  points: number;
  followers_count: number;
  following_count: number;
  files_count: number;
  account_status?: "active" | "suspended" | "deleted";
  region?: "china" | "world" | null;
}

// `roles` is only ever passed for the signed-in person themselves: who holds a
// staff role is secret, so other people's profiles are built with no roles.
export function userFromProfileRow(
  row: ProfileRow,
  roles: string[] = [],
  restrictedUntil?: string,
  badges?: ("answerer" | "verified")[]
): User {
  return {
    id: row.id,
    name: row.name,
    displayName: row.display_name ?? undefined,
    initials: initialsFromName(row.display_name || row.name),
    roles,
    badges: badges ?? (roles.filter((r) => r === "answerer" || r === "verified") as ("answerer" | "verified")[]),
    isAdmin: roles.includes("creator") || roles.includes("watcher"),
    isCreator: roles.includes("creator"),
    accountStatus: row.account_status ?? "active",
    region: row.region ?? null,
    restrictedUntil,
    memberSince: row.member_since,
    points: row.points,
    followers: row.followers_count,
    following: row.following_count,
    filesCount: row.files_count,
  };
}
