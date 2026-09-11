import { notFound } from "next/navigation";
import { getFilePostById, listFileComments } from "@/lib/data/files";
import { getUserById } from "@/lib/data/users";
import { BackLink } from "@/components/ui/BackLink";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Badge } from "@/components/ui/Badge";
import { Discussion } from "@/components/discussion/Discussion";
import { DownloadButton, RemixButton } from "@/components/files/FileDetailActions";

export default async function FileDetailPage({ params }: PageProps<"/files/[fileId]">) {
  const { fileId } = await params;
  const file = await getFilePostById(fileId);
  if (!file) notFound();

  const [author, comments] = await Promise.all([
    getUserById(file.authorId),
    listFileComments(file.id),
  ]);

  return (
    <>
      <BackLink href="/files" label="Back to File Board" />
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="preview-img large">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          preview
        </div>
        <div style={{ padding: "1rem 1.1rem" }}>
          <div className="row wrap" style={{ gap: 8, marginBottom: 8 }}>
            <Badge>{file.authorship === "original" ? "original" : file.authorship === "remix" ? "remix" : "found"}</Badge>
            <span className="tiny">posted by</span>
            {author && <AuthorLink userId={author.id} name={author.name} />}
          </div>
          <p className="title" style={{ margin: "0 0 8px" }}>{file.title}</p>
          <TranslatableText text={file.description} as="p" className="muted" />
          <div className="row tiny wrap" style={{ gap: 16, marginBottom: 6 }}>
            <span>{file.views.toLocaleString()} views</span>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="title" style={{ marginBottom: 4 }}>Files in this post</p>
        <p className="tiny" style={{ marginBottom: 10 }}>
          Titles and descriptions are translated automatically. The files themselves are shown exactly as uploaded —
          the hub can&apos;t translate what&apos;s inside them.
        </p>
        {file.assets.map((asset) => (
          <div className="row between" key={asset.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: 14, margin: 0 }}>{asset.label}</p>
              <p className="tiny">{asset.downloads} downloads</p>
            </div>
            <DownloadButton />
          </div>
        ))}
        <RemixButton />
      </div>

      <Discussion initialComments={comments} composeLabel="Ask a question" postAuthorId={file.authorId} />
    </>
  );
}
