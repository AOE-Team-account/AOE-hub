import { notFound } from "next/navigation";
import { getExperiencePostById, listExperienceComments } from "@/lib/data/experience";
import { getUserById } from "@/lib/data/users";
import { BackLink } from "@/components/ui/BackLink";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Discussion } from "@/components/discussion/Discussion";

export default async function ExperiencePostPage({ params }: PageProps<"/experience/[postId]">) {
  const { postId } = await params;
  const post = await getExperiencePostById(postId);
  if (!post) notFound();

  const [author, comments] = await Promise.all([
    getUserById(post.authorId),
    listExperienceComments(post.id),
  ]);

  return (
    <>
      <BackLink href="/experience" label="Back to Experience Board" />
      <div className="card">
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
          {author && <AuthorLink userId={author.id} name={author.name} />}
          <span className="tiny">
            {new Date(post.createdAt).toLocaleDateString()} · {post.views} views
          </span>
        </div>
        <TranslatableText text={post.body} as="p" className="muted" />
      </div>

      <Discussion initialComments={comments} composeLabel="Add a comment" postAuthorId={post.authorId} />
    </>
  );
}
