"use client";

// Admin moderation actions, called from the browser client with the admin's
// own session. Content removal and warnings rely on the existing RLS
// policies ("... or is_admin(auth.uid())" on file_posts/experience_posts/
// comments/groups, and reports/notifications) — no service role needed here.
// Account deletion is the one exception (see /api/admin/users) because
// deleting an auth.users row isn't something RLS can grant to a browser.

import { createClient } from "@/lib/supabase/client";
import type { AdminReport } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

const CONTENT_TABLE: Partial<Record<AdminReport["targetType"], { table: string; authorColumn: string }>> = {
  file: { table: "file_posts", authorColumn: "author_id" },
  "experience-post": { table: "experience_posts", authorColumn: "author_id" },
  group: { table: "groups", authorColumn: "created_by" },
  comment: { table: "comments", authorColumn: "author_id" },
};

export function reportTargetHref(report: Pick<AdminReport, "targetType" | "targetId">): string | null {
  switch (report.targetType) {
    case "file":
      return `/files/${report.targetId}`;
    case "experience-post":
      return `/experience/${report.targetId}`;
    case "user":
      return `/u/${report.targetId}`;
    case "group":
      // No single-group page exists yet — the Groups tab is the closest real destination.
      return "/groups";
    default:
      return null;
  }
}

async function resolveAuthorId(supabase: Supabase, report: AdminReport): Promise<string | null> {
  if (report.targetType === "user") return report.targetId;
  const mapping = CONTENT_TABLE[report.targetType];
  if (!mapping) return null;
  const { data } = await supabase.from(mapping.table).select(mapping.authorColumn).eq("id", report.targetId).maybeSingle();
  return (data as Record<string, string> | null)?.[mapping.authorColumn] ?? null;
}

export async function removeReportedContent(report: AdminReport): Promise<{ error?: string }> {
  const mapping = CONTENT_TABLE[report.targetType];
  if (!mapping) return { error: "This report type has no content to remove — use Delete account instead." };
  const supabase = createClient();
  const { error } = await supabase.from(mapping.table).delete().eq("id", report.targetId);
  if (error) return { error: error.message };
  await supabase.from("reports").update({ status: "resolved" }).eq("id", report.id);
  return {};
}

export async function warnReportedUser(report: AdminReport): Promise<{ error?: string }> {
  const supabase = createClient();
  const userId = await resolveAuthorId(supabase, report);
  if (!userId) return { error: "Could not find who to warn — the content may already be gone." };
  // notifications has no client insert policy (every other write to it goes
  // through a SECURITY DEFINER path too) — admin_notify_user is that path.
  const { error } = await supabase.rpc("admin_notify_user", {
    p_user_id: userId,
    p_body: `An admin reviewed a report about your content (reason: ${report.reason}) and is warning you to review the community guidelines.`,
  });
  if (error) return { error: error.message };
  await supabase.from("reports").update({ status: "resolved" }).eq("id", report.id);
  return {};
}

export async function dismissReport(reportId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.from("reports").update({ status: "dismissed" }).eq("id", reportId);
  return error ? { error: error.message } : {};
}

export async function deleteGroup(groupId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  // Resolve any open reports on it first so the reports queue doesn't keep a
  // stale row pointing at a group that no longer exists.
  await supabase.from("reports").update({ status: "resolved" }).eq("target_type", "group").eq("target_id", groupId).eq("status", "open");
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  return error ? { error: error.message } : {};
}

export async function deleteUserAccount(userId: string): Promise<{ error?: string }> {
  const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (res.ok) return {};
  const data = await res.json().catch(() => ({}));
  return { error: data?.error || "Could not delete the account." };
}
