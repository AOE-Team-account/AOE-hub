// Data-access layer for users/profiles. Phase 1: in-memory mock data.

import { USERS, getUserById as getMockUser } from "@/lib/mock-data";
import type { User } from "@/lib/types";

export async function getUserById(id: string): Promise<User | undefined> {
  return getMockUser(id);
}

export async function listUsers(): Promise<User[]> {
  return USERS;
}
