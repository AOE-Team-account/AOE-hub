import { notFound } from "next/navigation";
import { getUserById } from "@/lib/data/users";
import { listFilePosts } from "@/lib/data/files";
import { listExperiencePosts } from "@/lib/data/experience";
import { BackLink } from "@/components/ui/BackLink";
import { FollowButton } from "@/components/profile/FollowButton";

export default async function PublicProfilePage({ params }: PageProps<"/u/[userId]">) {
  const { userId } = await params;
  const user = await getUserById(userId);
  if (!user) notFound();

  const [files, posts] = await Promise.all([listFilePosts(), listExperiencePosts()]);
  const userFiles = files.filter((f) => f.authorId === userId);
  const userPosts = posts.filter((p) => p.authorId === userId && !p.isAnnouncement);

  return (
    <>
      <BackLink href="/experience" label="Back" />
      <div className="card row between">
        <div className="row" style={{ gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--accent)",
              color: "var(--accent-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontFamily: "var(--font-heading)",
              flexShrink: 0,
            }}
          >
            {user.initials}
          </div>
          <div>
            <p className="title" style={{ margin: 0 }}>{user.name}</p>
            <p className="tiny">
              member since {new Date(user.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })} ·{" "}
              {user.points.toLocaleString()} points · {user.followers.toLocaleString()} followers
            </p>
          </div>
        </div>
        <FollowButton />
      </div>

      {userFiles.length > 0 && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>Files</p>
          {userFiles.map((f) => (
            <div className="card" key={f.id}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{f.title}</p>
              <p className="tiny">File board · {f.views.toLocaleString()} views</p>
            </div>
          ))}
        </>
      )}

      {userPosts.length > 0 && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>Recent posts</p>
          {userPosts.map((p) => (
            <div className="card" key={p.id}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{p.title ?? p.body.slice(0, 60)}</p>
              <p className="tiny">Experience board · {p.replyCount} replies</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
