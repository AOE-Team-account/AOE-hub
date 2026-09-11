// Data-access layer for Groups. Phase 1: in-memory mock data.

import { GROUPS } from "@/lib/mock-data";
import type { Group } from "@/lib/types";

export async function listGroups(): Promise<Group[]> {
  return GROUPS;
}

export async function getGroupById(id: string): Promise<Group | undefined> {
  return GROUPS.find((g) => g.id === id);
}

// Eligibility to create a group, per project memory: 500+ points, account
// older than 90 days, no unresolved reports.
export const GROUP_CREATE_MIN_POINTS = 500;
export const GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS = 90;

export function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}
