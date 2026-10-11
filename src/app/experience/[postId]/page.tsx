import { notFound } from "next/navigation";
import { getExperiencePostById, listExperienceComments } from "@/lib/data/experience";
import { getUserById } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import type { User } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Discussion } from "@/components/discussion/Discussion";
import { NoticeBox } from "@/components/review/NoticeBox";
import { getNotices, flattenCommentIds } from "@/lib/data/notices";

function collectAuthorIds(comments: Awaited<ReturnType<typeof listExperienceComments>>): string[] {
  const ids: string[] = [];
  for (const c of comments) {
    ids.push(c.authorId);
    for (const r of c.replies ?? []) ids.push(r.authorId);
  }
  return ids;
}

export default async function ExperiencePostPage({ params }: PageProps<"/experience/[postId]">) {
  const { postId } = await params;
  const post = await getExperiencePostById(postId);
  if (!post) notFound();

  const [author, comments] = await Promise.all([
    getUserById(post.authorId),
    listExperienceComments(post.id),
  ]);

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (viewer) {
    // Server-only function: the viewer id comes from the verified session above.
    await createServiceRoleClient().rpc("record_view", { p_target_type: "experience-post", p_target_id: post.id, p_viewer_id: viewer.id });
  }

  const commentAuthorIds = [...new Set(collectAuthorIds(comments))];
  const { data: authorRows } = commentAuthorIds.length
    ? await supabase.from("profiles").select("*").in("id", commentAuthorIds)
    : { data: [] as ProfileRow[] };
  const authors: Record<string, User | undefined> = Object.fromEntries(
    (authorRows ?? []).map((row) => [row.id, userFromProfileRow(row as ProfileRow)])
  );

  const [postNotices, commentNotices] = await Promise.all([
    getNotices(supabase, "post", [post.id]),
    getNotices(supabase, "comment", flattenCommentIds(comments)),
  ]);

  return (
    <>
      <BackLink href="/experience" label="Back to Experience Board" />
      <NoticeBox notice={postNotices[post.id]} />
      <div className="card">
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          {/* Hub announcements read as coming from AOEhub, never from a person. */}
          {post.isAnnouncement ? <span style={{ fontWeight: 500 }}>AOEhub</span> : author && <AuthorLink userId={author.id} name={author.name} />}
          <span className="tiny">
            {new Date(post.createdAt).toLocaleDateString()} · {post.views} views
          </span>
        </div>
        <TranslatableText text={post.body} as="p" className="muted" />
      </div>

      <Discussion
        parentType="experience-post"
        parentId={post.id}
        initialComments={comments}
        authors={authors}
        composeLabel="Add a comment"
        postAuthorId={post.authorId}
        notices={commentNotices}
      />
    </>
  );
}
