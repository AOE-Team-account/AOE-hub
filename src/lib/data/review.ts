import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Data for the reviewer panels. Everything is read with the reviewer's own
// session, so row-level security decides what a Watcher, a Deacon or the
// Creator may see (reports and content by kind). Nothing here is cached.

export type ItemKind = "file" | "post" | "comment";

export interface ReviewItem {
  kind: ItemKind;
  id: string;
  title: string;
  excerpt: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  href: string;
  notice: { tier: "watcher" | "deacon" | "creator"; body: string } | null;
  mine: boolean;
}

export interface ReviewReport {
  id: string;
  targetType: "file" | "experience-post" | "comment" | "user";
  targetId: string;
  reason: string;
  details: string | null;
  createdAt: string;
  item: ReviewItem | null;
  userName?: string;
}

export interface Summary {
  green: number;
  yellow: number;
  red: number;
  restricted: boolean;
  status: string;
}

export interface Reason {
  code: string;
  label: string;
  level: "green" | "yellow" | "red" | null;
  appliesTo: string[];
}

export interface ReviewData {
  kinds: ItemKind[];
  reports: ReviewReport[];
  browse: ReviewItem[];
  summaries: Record<string, Summary>;
  reasons: Reason[];
}

const PER_KIND = 30;
const cut = (s: string | null | undefined, n = 180) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

type Row = Record<string, unknown>;

export async function loadReviewData(supabase: SupabaseClient, viewerId: string, kinds: ItemKind[]): Promise<ReviewData> {
  const { data: reportRows } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, details, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  const reports = (reportRows ?? []) as Row[];

  const want = { file: new Set<string>(), post: new Set<string>(), comment: new Set<string>(), user: new Set<string>() };
  for (const r of reports) {
    const t = r.target_type as string;
    const id = r.target_id as string;
    if (t === "file") want.file.add(id);
    else if (t === "experience-post") want.post.add(id);
    else if (t === "comment") want.comment.add(id);
    else if (t === "user") want.user.add(id);
  }

  const files: Row[] = [];
  const posts: Row[] = [];
  const comments: Row[] = [];

  if (kinds.includes("file")) {
    const ids = [...want.file];
    const [recent, wanted] = await Promise.all([
      supabase.from("file_posts").select("id, title, description, author_id, created_at").order("created_at", { ascending: false }).limit(PER_KIND),
      ids.length ? supabase.from("file_posts").select("id, title, description, author_id, created_at").in("id", ids) : { data: [] },
    ]);
    files.push(...((recent.data ?? []) as Row[]), ...((wanted.data ?? []) as Row[]));
  }
  {
    const ids = [...want.post];
    const [recent, wanted] = await Promise.all([
      supabase.from("experience_posts").select("id, title, body, author_id, created_at, is_announcement").order("created_at", { ascending: false }).limit(PER_KIND),
      ids.length ? supabase.from("experience_posts").select("id, title, body, author_id, created_at, is_announcement").in("id", ids) : { data: [] },
    ]);
    posts.push(...((recent.data ?? []) as Row[]), ...((wanted.data ?? []) as Row[]));
  }
  {
    const ids = [...want.comment];
    const [recent, wanted] = await Promise.all([
      supabase.from("comments").select("id, body, author_id, parent_type, parent_id, created_at").order("created_at", { ascending: false }).limit(PER_KIND),
      ids.length ? supabase.from("comments").select("id, body, author_id, parent_type, parent_id, created_at").in("id", ids) : { data: [] },
    ]);
    comments.push(...((recent.data ?? []) as Row[]), ...((wanted.data ?? []) as Row[]));
  }

  // People: authors and any reported accounts.
  const personIds = new Set<string>([...want.user]);
  for (const r of [...files, ...posts, ...comments]) personIds.add(r.author_id as string);
  const { data: people } = personIds.size
    ? await supabase.from("profiles").select("id, name, display_name").in("id", [...personIds])
    : { data: [] as Row[] };
  const names = new Map<string, string>(((people ?? []) as Row[]).map((p) => [p.id as string, ((p.display_name as string) || (p.name as string)) ?? "Member"]));

  const noticeRows: Row[] = [];
  for (const [kind, list] of [["file", files], ["post", posts], ["comment", comments]] as const) {
    const ids = [...new Set(list.map((r) => r.id as string))];
    if (ids.length) {
      const { data } = await supabase.from("item_notices").select("item_kind, item_id, body, tier").eq("item_kind", kind).in("item_id", ids);
      noticeRows.push(...((data ?? []) as Row[]));
    }
  }
  const notices = new Map<string, ReviewItem["notice"]>(
    noticeRows.map((n) => [`${n.item_kind}:${n.item_id}`, { tier: n.tier as "watcher" | "deacon" | "creator", body: n.body as string }])
  );

  const build = (kind: ItemKind, r: Row): ReviewItem => {
    const authorId = r.author_id as string;
    let title = "";
    let excerpt = "";
    let href = "/";
    if (kind === "file") {
      title = (r.title as string) || "File";
      excerpt = cut(r.description as string);
      href = `/files/${r.id}`;
    } else if (kind === "post") {
      title = (r.title as string) || (r.is_announcement ? "Announcement" : "Experience post");
      excerpt = cut(r.body as string);
      href = `/experience/${r.id}`;
    } else {
      title = "Comment";
      excerpt = cut(r.body as string);
      href = r.parent_type === "file" ? `/files/${r.parent_id}` : `/experience/${r.parent_id}`;
    }
    return {
      kind,
      id: r.id as string,
      title,
      excerpt,
      authorId,
      authorName: names.get(authorId) ?? "Member",
      createdAt: r.created_at as string,
      href,
      notice: notices.get(`${kind}:${r.id}`) ?? null,
      mine: authorId === viewerId,
    };
  };

  const byKey = new Map<string, ReviewItem>();
  const addAll = (kind: ItemKind, rows: Row[]) => {
    for (const r of rows) {
      const key = `${kind}:${r.id}`;
      if (!byKey.has(key)) byKey.set(key, build(kind, r));
    }
  };
  addAll("file", files);
  addAll("post", posts);
  addAll("comment", comments);

  const kindOfType = (t: string): ItemKind | null => (t === "file" ? "file" : t === "experience-post" ? "post" : t === "comment" ? "comment" : null);

  const reportList: ReviewReport[] = reports.map((r) => {
    const k = kindOfType(r.target_type as string);
    return {
      id: r.id as string,
      targetType: r.target_type as ReviewReport["targetType"],
      targetId: r.target_id as string,
      reason: r.reason as string,
      details: (r.details as string | null) ?? null,
      createdAt: r.created_at as string,
      item: k ? byKey.get(`${k}:${r.target_id}`) ?? null : null,
      userName: r.target_type === "user" ? names.get(r.target_id as string) : undefined,
    };
  });

  const reportedKeys = new Set(reportList.filter((r) => r.item).map((r) => `${kindOfType(r.targetType)}:${r.targetId}`));
  const browse = [...byKey.entries()]
    .filter(([key]) => !reportedKeys.has(key) || true)
    .map(([, item]) => item)
    .filter((i) => kinds.includes(i.kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const authorIds = [...new Set([...byKey.values()].map((i) => i.authorId))];
  const summaries: Record<string, Summary> = {};
  if (authorIds.length) {
    const { data } = await supabase.rpc("warning_summaries", { p_user_ids: authorIds });
    for (const s of (data ?? []) as Row[]) {
      summaries[s.user_id as string] = {
        green: s.green as number,
        yellow: s.yellow as number,
        red: s.red as number,
        restricted: s.restricted as boolean,
        status: s.account_status as string,
      };
    }
  }

  const { data: reasonRows } = await supabase
    .from("moderation_reasons")
    .select("code, label, level, applies_to, sort_order")
    .eq("active", true)
    .order("sort_order");
  const reasons: Reason[] = ((reasonRows ?? []) as Row[]).map((r) => ({
    code: r.code as string,
    label: r.label as string,
    level: (r.level as Reason["level"]) ?? null,
    appliesTo: (r.applies_to as string[]) ?? [],
  }));

  return { kinds, reports: reportList, browse, summaries, reasons };
}
