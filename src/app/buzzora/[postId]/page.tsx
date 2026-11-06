import { notFound } from "next/navigation";
import { getExperiencePostById, listExperienceComments } from "@/lib/data/experience";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import { getBadgeMap } from "@/lib/data/badges";
import type { User } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { Badge } from "@/components/ui/Badge";
import { Translated } from "@/components/ui/Translated";
import { Discussion } from "@/components/discussion/Discussion";
import { NoticeBox } from "@/components/review/NoticeBox";
import { BuzzSources } from "@/components/buzzora/BuzzSources";
import { BuzzMove } from "@/components/buzzora/StaffTools";
import { getServerT } from "@/lib/i18n/server";
import { getNotices, flattenCommentIds } from "@/lib/data/notices";

export default async function BuzzoraPostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { t, lang } = await getServerT();
  const { postId } = await params;
  const post = await getExperiencePostById(postId);
  if (!post || post.board !== "buzzora") notFound();
  const comments = await listExperienceComments(post.id);

  const supabase = await createClient();
  const { data: { user: viewer } } = await supabase.auth.getUser();
  if (viewer) await createServiceRoleClient().rpc("record_view", { p_target_type: "experience-post", p_target_id: post.id, p_viewer_id: viewer.id });

  const ids: string[] = [];
  for (const c of comments) { ids.push(c.authorId); for (const r of c.replies ?? []) ids.push(r.authorId); }
  const commentAuthorIds = [...new Set(ids)];
  const { data: authorRows } = commentAuthorIds.length ? await supabase.from("profiles").select("*").in("id", commentAuthorIds) : { data: [] as ProfileRow[] };
  const badgeMap = await getBadgeMap(supabase, commentAuthorIds);
  const authors: Record<string, User | undefined> = Object.fromEntries(
    (authorRows ?? []).map((row) => [row.id, userFromProfileRow(row as ProfileRow, [], undefined, badgeMap[row.id] ?? [])])
  );
  const [postNotices, commentNotices] = await Promise.all([
    getNotices(supabase, "post", [post.id]),
    getNotices(supabase, "comment", flattenCommentIds(comments)),
  ]);
  const kindKey = post.buzzKind ? (`buzz.tab.${post.buzzKind}` as const) : null;

  return (
    <>
      <BackLink href="/buzzora" label={t("buzz.back")} />
      <NoticeBox notice={postNotices[post.id]} itemKey={`post:${post.id}`} />
      <div className="card">
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 500 }}>AOEhub</span>
          {kindKey && <Badge>{t(kindKey)}</Badge>}
          {post.country && <Badge variant="neutral">{post.country}</Badge>}
          <span className="tiny">{new Date(post.createdAt).toLocaleDateString(lang)} · {t("files.views", { n: post.views })}</span>
        </div>
        {post.title && <Translated type="experience-post" id={post.id} field="title" text={post.title} className="title" style={{ margin: "0 0 6px" }} />}
        <Translated type="experience-post" id={post.id} field="body" text={post.body} className="muted" note noteWhenPaused />
        {post.sources && <BuzzSources sources={post.sources} />}
        <p className="tiny" style={{ margin: "6px 0 0" }}>{post.isAi ? t("buzz.aiLabel") : t("buzz.staffLabel")}</p>
      </div>
      <BuzzMove postId={post.id} kind={post.buzzKind} country={post.country} />
      <Discussion
        parentType="experience-post"
        parentId={post.id}
        initialComments={comments}
        authors={authors}
        composeLabel={t("discussion.addComment")}
        postAuthorId={post.authorId}
        notices={commentNotices}
      />
    </>
  );
}
