// Data-access layer for the Admin Dashboard. Phase 1: in-memory mock data.
//
// Deliberate rule from project memory: groups/users only ever show up here
// when reported, or when an admin searches for them directly — never a
// default scrollable list. Callers should keep respecting that even once
// this is backed by real queries.

import { ADMIN_REPORTS, GROUPS, USERS } from "@/lib/mock-data";
import type { AdminReport, Group, User } from "@/lib/types";

export async function listOpenReports(): Promise<AdminReport[]> {
  return ADMIN_REPORTS.filter((r) => r.status === "open");
}

export async function searchGroupsByName(query: string): Promise<Group[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return GROUPS.filter((g) => g.name.toLowerCase().includes(q));
}

export async function listReportedGroups(): Promise<Group[]> {
  return GROUPS.filter((g) => g.reported);
}

export async function searchUsers(query: string): Promise<User[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return USERS.filter((u) => u.name.toLowerCase().includes(q));
}
