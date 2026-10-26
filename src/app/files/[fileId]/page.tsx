import { notFound } from "next/navigation";
import { getFilePostById, listFileComments } from "@/lib/data/files";
import { getUserById } from "@/lib/data/users";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import { getBadgeMap } from "@/lib/data/badges";
import type { User } from "@/lib/types";
import { BackLink } from "@/components/ui/BackLink";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { Translated } from "@/components/ui/Translated";
import { Badge } from "@/components/ui/Badge";
import { MediaGallery } from "@/components/ui/MediaGallery";
import { GamePlayer } from "@/components/files/GamePlayer";
import { Discussion } from "@/components/discussion/Discussion";
import { NoticeBox } from "@/components/review/NoticeBox";
import { getServerT } from "@/lib/i18n/server";
import { lookStyle } from "@/lib/profile-look";
import { getNotices, flattenCommentIds } from "@/lib/data/notices";
import { ScanWatcher } from "@/components/files/ScanWatcher";
import { CONTACT_EMAIL } from "@/lib/site";
import { DownloadButton, RemixButton } from "@/components/files/FileDetailActions";

function collectAuthorIds(comments: Awaited<ReturnType<typeof listFileComments>>): string[] {
  const ids: string[] = [];
  for (const c of comments) {
    ids.push(c.authorId);
    for (const r of c.replies ?? []) ids.push(r.authorId);
  }
  return ids;
}

export default async function FileDetailPage({ params }: PageProps<"/files/[fileId]">) {
  const { t } = await getServerT();
  const { fileId } = await params;
  const file = await getFilePostById(fileId);
  if (!file) notFound();

  const [author, comments] = await Promise.all([
    getUserById(file.authorId),
    listFileComments(file.id),
  ]);

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  if (viewer) {
    // Server-only function: the viewer id comes from the verified session above.
    await createServiceRoleClient().rpc("record_view", { p_target_type: "file", p_target_id: file.id, p_viewer_id: viewer.id });
  }

  const commentAuthorIds = [...new Set(collectAuthorIds(comments))];
  const { data: authorRows } = commentAuthorIds.length
    ? await supabase.from("profiles").select("*").in("id", commentAuthorIds)
    : { data: [] as ProfileRow[] };
  const badgeMap = await getBadgeMap(supabase, commentAuthorIds);
  const authors: Record<string, User | undefined> = Object.fromEntries(
    (authorRows ?? []).map((row) => [row.id, userFromProfileRow(row as ProfileRow, [], undefined, badgeMap[row.id] ?? [])])
  );

  const [fileNotices, commentNotices] = await Promise.all([
    getNotices(supabase, "file", [file.id]),
    getNotices(supabase, "comment", flattenCommentIds(comments)),
  ]);

  return (
    <>
      <BackLink href="/files" label={t("file.back")} />
      <NoticeBox notice={fileNotices[file.id]} itemKey={`file:${file.id}`} />
      <div className="card" style={{ padding: 0, overflow: "hidden", ...(author ? lookStyle(author) : {}) }}>
        {(file.media?.length ?? 0) === 0 && (
          <div className="preview-img large">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            {t("files.previewLabel")}
          </div>
        )}
        <div style={{ padding: "1rem 1.1rem" }}>
          <MediaGallery media={file.media ?? []} />
          <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
            <Badge>{t(file.authorship === "original" ? "files.badge.original" : file.authorship === "remix" ? "files.badge.remix" : "files.badge.found")}</Badge>
            {file.madeWithAi && <Badge variant="neutral">{t("badge.madeWithAi")}</Badge>}
            <span className="tiny">{t("file.postedBy")}</span>
            {author && <AuthorLink userId={author.id} name={author.name} badges={author.badges} />}
          </div>
          <Translated type="file" id={file.id} field="title" text={file.title} className="title" style={{ margin: "0 0 8px" }} />
          <Translated type="file" id={file.id} field="description" text={file.description} className="muted" note noteWhenPaused />
          <div className="row tiny wrap" style={{ gap: 16, marginBottom: 6 }}>
            <span>{t("files.views", { n: file.views.toLocaleString() })}</span>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="title" style={{ marginBottom: 4 }}>{t("file.filesInPost")}</p>
        <p className="tiny" style={{ marginBottom: 10 }}>
          {t("file.translatedNote")}
        </p>
        <ScanWatcher active={file.assets.some((a) => a.scanStatus === "uploading" || a.scanStatus === "pending")} />
        {file.assets.some((a) => a.scanStatus === "uploading" || a.scanStatus === "pending") && (
          <p className="policy-note" style={{ marginBottom: 10 }}>{t("file.scanBanner")}</p>
        )}
        {file.assets.some((a) => a.scanStatus === "flagged") && (
          <p className="policy-note" style={{ marginBottom: 10 }}>{t("file.scanFlaggedBanner", { email: CONTACT_EMAIL ?? "" })}</p>
        )}
        {file.assets.some((a) => a.scanStatus === "error") && (
          <p className="policy-note" style={{ marginBottom: 10 }}>{t("file.scanErrorBanner", { email: CONTACT_EMAIL ?? "" })}</p>
        )}
        {file.assets.filter((a) => a.isGame && a.scanStatus === "clean").map((a) => (
          <GamePlayer key={a.id} assetId={a.id} />
        ))}
        {file.assets.some((a) => a.isGame && (a.scanStatus === "pending" || a.scanStatus === "uploading")) && <p className="tiny" style={{ marginBottom: 8 }}>{t("game.checking")}</p>}
        {file.assets.map((asset) =>
          asset.isLink && asset.linkUrl ? (
            <div key={asset.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{asset.label}</p>
                  <p className="tiny" style={{ margin: 0 }}>
                    <Badge variant="neutral">{t("file.hostedOutside")}</Badge> {new URL(asset.linkUrl).hostname}
                  </p>
                </div>
                <a className="btn primary small" href={asset.linkUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {t("file.openLink")}
                </a>
              </div>
              <p className="tiny" style={{ margin: "6px 0 0" }}>{t("file.hostedOutsideNote")}</p>
            </div>
          ) : (
            <div className="row between" key={asset.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
              <div>
                <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{asset.label}</p>
                <p className="tiny">
                  {t("file.downloads", { n: asset.downloads })}
                  {asset.scanStatus === "uploading" && t("file.uploadingNote")}
                  {asset.scanStatus === "pending" && t("file.pendingNote")}
                  {asset.scanStatus === "flagged" && t("file.flaggedNote")}
                  {asset.scanStatus === "error" && t("file.errorNote")}
                </p>
              </div>
              <DownloadButton assetId={asset.id} scanStatus={asset.scanStatus} />
            </div>
          )
        )}
        <RemixButton />
      </div>

      <Discussion
        parentType="file"
        parentId={file.id}
        initialComments={comments}
        authors={authors}
        composeLabel={t("discussion.askQuestion")}
        postAuthorId={file.authorId}
        notices={commentNotices}
      />
    </>
  );
}
