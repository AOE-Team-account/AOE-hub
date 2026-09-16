"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChipRow } from "@/components/ui/ChipRow";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { ReportButton } from "@/components/ui/ReportButton";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { Badge } from "@/components/ui/Badge";
import type { FilePost, FileSection, MediaType, User } from "@/lib/types";

const SECTION_OPTIONS: { value: FileSection | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "curriculum", label: "Curriculum" },
  { value: "games", label: "Games" },
  { value: "books", label: "Books" },
  { value: "cards", label: "Cards" },
  { value: "songs", label: "Songs" },
  { value: "art", label: "Art projects" },
  { value: "printables", label: "Printables" },
  { value: "apps", label: "Apps" },
];

const MEDIA_TYPE_OPTIONS: { value: MediaType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "image", label: "Image" },
  { value: "document", label: "Document" },
  { value: "game", label: "Game / App" },
];

export function FileBoardClient({ files, authors }: { files: FilePost[]; authors: Record<string, User | undefined> }) {
  return (
    <Suspense fallback={null}>
      <FileBoardContent files={files} authors={authors} />
    </Suspense>
  );
}

function FileBoardContent({ files, authors }: { files: FilePost[]; authors: Record<string, User | undefined> }) {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [section, setSection] = useState<FileSection | "all">("all");
  const [mediaType, setMediaType] = useState<MediaType | "all">("all");

  const filtered = useMemo(() => {
    return files.filter((f) => {
      if (section !== "all" && f.section !== section) return false;
      if (mediaType !== "all" && f.mediaType !== mediaType && !(mediaType === "game" && f.mediaType === "app")) return false;
      if (query && !`${f.title} ${f.description}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [files, section, mediaType, query]);

  return (
    <>
      {!query && (
        <div className="start-here">
          <div>
            <p className="title" style={{ margin: "0 0 2px", fontSize: 14.5 }}>New here? Start with these</p>
            <p className="tiny">A short, admin-picked path for families just getting started.</p>
          </div>
          <button className="btn">Browse</button>
        </div>
      )}

      <ChipRow options={SECTION_OPTIONS} value={section} onChange={setSection} />

      <p className="tiny" style={{ marginBottom: 6 }}>Filter by type</p>
      <ChipRow options={MEDIA_TYPE_OPTIONS} value={mediaType} onChange={setMediaType} />

      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="title" style={{ margin: 0 }}>{query ? `Results for "${query}"` : "Recommended for you"}</p>
        <select>
          <option>Most relevant</option>
          <option>Newest</option>
          <option>Most discussed</option>
        </select>
      </div>

      {filtered.map((file) => {
        const author = authors[file.authorId];
        return (
          <ClickableCard key={file.id} href={`/files/${file.id}`} className="file-card">
            <div className="preview-img">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
              preview
            </div>
            <div className="body">
              <div className="row between">
                <p className="title" style={{ margin: 0 }}>{file.title}</p>
                <Badge>{file.authorship === "original" ? "original" : file.authorship === "remix" ? "remix" : "found"}</Badge>
              </div>
              <p className="muted">{file.description}</p>
              <div className="row tiny wrap" style={{ gap: 12 }}>
                {author && <AuthorLink userId={author.id} name={author.name} />}
                <span>{file.views.toLocaleString()} views</span>
                <ReportButton targetType="file" targetId={file.id} />
              </div>
            </div>
          </ClickableCard>
        );
      })}

      {filtered.length === 0 && <p className="muted">No files match those filters yet.</p>}
    </>
  );
}
