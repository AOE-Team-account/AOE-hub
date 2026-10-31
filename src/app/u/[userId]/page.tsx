import { notFound } from "next/navigation";
import { getUserById } from "@/lib/data/users";
import { listFilePosts } from "@/lib/data/files";
import { listExperiencePosts } from "@/lib/data/experience";
import { getServerT } from "@/lib/i18n/server";
import { BackLink } from "@/components/ui/BackLink";
import { FollowButton } from "@/components/profile/FollowButton";
import { Avatar } from "@/components/profile/Avatar";
import { ReportProfilePicture } from "@/components/profile/ReportProfilePicture";
import { lookStyle } from "@/lib/profile-look";

export default async function PublicProfilePage({ params }: PageProps<"/u/[userId]">) {
  const { t, lang } = await getServerT();
  const { userId } = await params;
  const user = await getUserById(userId);
  if (!user) notFound();

  const [files, posts] = await Promise.all([listFilePosts(), listExperiencePosts()]);
  const userFiles = files.filter((f) => f.authorId === userId);
  const userPosts = posts.filter((p) => p.authorId === userId && !p.isAnnouncement);

  return (
    <>
      <BackLink href="/experience" label={t("common.back")} />
      <div className="card row between" style={lookStyle({ background: user.background, postFont: user.postFont })}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar userId={user.id} initials={user.initials} avatarV={user.avatarV} frame={user.frame} />
          <div>
            <p role="heading" aria-level={2} className="title" style={{ margin: 0, color: "inherit" }}>{user.name}</p>
            <p className="tiny" style={{ color: "inherit", opacity: 0.8 }}>
              {t("u.memberSince", {
                date: new Date(user.memberSince).toLocaleDateString(lang, { month: "long", year: "numeric" }),
                followers: user.followers.toLocaleString(),
              })}
            </p>
            {user.avatarV && <ReportProfilePicture userId={user.id} />}
          </div>
        </div>
        <FollowButton />
      </div>

      {userFiles.length > 0 && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>{t("u.files")}</p>
          {userFiles.map((f) => (
            <div className="card" key={f.id}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{f.title}</p>
              <p className="tiny">{t("u.fileBoard", { n: f.views.toLocaleString() })}</p>
            </div>
          ))}
        </>
      )}

      {userPosts.length > 0 && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>{t("u.recentPosts")}</p>
          {userPosts.map((p) => (
            <div className="card" key={p.id}>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{p.title ?? p.body.slice(0, 60)}</p>
              <p className="tiny">{t("u.expBoard", { n: p.replyCount })}</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
