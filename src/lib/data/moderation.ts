"use client";

// Reviewer moderation actions, called from the browser client with the
// reviewer's own session. Each one goes through a database function that
// checks the caller's role on the server, records the action in the activity
// log and tells the author privately (see soft_delete_item / dismiss_report in
// supabase/schema.sql) — no service role needed here. Account deletion is the
// one exception (see /api/admin/users): deleting an auth.users row isn't
// something a browser can be granted, and it is Creator-only.

import { createClient } from "@/lib/supabase/client";
import type { AdminReport } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

const CONTENT_TABLE: Partial<Record<AdminReport["targetType"], { table: string; authorColumn: string }>> = {
  file: { table: "file_posts", authorColumn: "author_id" },
  "experience-post": { table: "experience_posts", authorColumn: "author_id" },
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

// Reviewer deletions go to the trash through soft_delete_item() (reason
// required, activity log, the author is told privately). The report's own
// reason is used as the deletion reason until the new panels let the
// reviewer pick one.
const DELETE_KIND: Partial<Record<AdminReport["targetType"], string>> = {
  file: "file",
  "experience-post": "post",
  comment: "comment",
};

export async function removeReportedContent(report: AdminReport): Promise<{ error?: string }> {
  const kind = DELETE_KIND[report.targetType];
  if (!kind) return { error: "This report type has no content to remove — use Delete account instead." };
  const supabase = createClient();
  const { error } = await supabase.rpc("soft_delete_item", {
    p_kind: kind,
    p_id: report.targetId,
    p_reason: report.reason,
  });
  return error ? { error: error.message } : {};
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
  // The report stays open: settling it (delete or dismiss) is a separate,
  // logged action. Proper warnings arrive with the new Watcher/Deacon panels.
  return error ? { error: error.message } : {};
}

export async function dismissReport(reportId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("dismiss_report", { p_report_id: reportId, p_reason: "no-violation" });
  return error ? { error: error.message } : {};
}

// Creator only. "Delete" disables the account and hides its content; it is
// erased for good after 30 days and can be restored until then.
export async function deleteUserAccount(userId: string): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("set_account_status", { p_user_id: userId, p_status: "deleted" });
  return error ? { error: error.message } : {};
}
