"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChipRow } from "@/components/ui/ChipRow";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { ReportButton } from "@/components/ui/ReportButton";
import { ClickableCard } from "@/components/ui/ClickableCard";
import { Badge } from "@/components/ui/Badge";
import { Translated } from "@/components/ui/Translated";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import { lookStyle } from "@/lib/profile-look";
import type { FilePost, FileSection, MediaType, User } from "@/lib/types";

const SECTION_OPTION_KEYS: { value: FileSection | "all"; key: UiKey }[] = [
  { value: "all", key: "files.section.all" },
  { value: "curriculum", key: "files.section.curriculum" },
  { value: "games", key: "files.section.games" },
  { value: "books", key: "files.section.books" },
  { value: "cards", key: "files.section.cards" },
  { value: "songs", key: "files.section.songs" },
  { value: "art", key: "files.section.art" },
  { value: "printables", key: "files.section.printables" },
  { value: "apps", key: "files.section.apps" },
  { value: "other", key: "files.section.other" },
];

const MEDIA_TYPE_OPTION_KEYS: { value: MediaType | "all"; key: UiKey }[] = [
  { value: "all", key: "files.media.all" },
  { value: "video", key: "files.media.video" },
  { value: "audio", key: "files.media.audio" },
  { value: "image", key: "files.media.image" },
  { value: "document", key: "files.media.document" },
  { value: "game", key: "files.media.game" },
  { value: "other", key: "files.media.other" },
];

export function FileBoardClient({ files, authors }: { files: FilePost[]; authors: Record<string, User | undefined> }) {
  return (
    <Suspense fallback={null}>
      <FileBoardContent files={files} authors={authors} />
    </Suspense>
  );
}

function FileBoardContent({ files, authors }: { files: FilePost[]; authors: Record<string, User | undefined> }) {
  const { t } = useLanguage();
  const sectionOptions = SECTION_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.key) }));
  const mediaTypeOptions = MEDIA_TYPE_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.key) }));
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [section, setSection] = useState<FileSection | "all">("all");
  const [mediaType, setMediaType] = useState<MediaType | "all">("all");

  const filtered = useMemo(() => {
    const matching = files.filter((f) => {
      if (section !== "all" && f.section !== section) return false;
      if (mediaType !== "all" && f.mediaType !== mediaType && !(mediaType === "game" && f.mediaType === "app")) return false;
      if (query && !`${f.title} ${f.description}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
    // Answerers' files are pinned to the top of the board, but never inside a
    // search: results stay in relevance order.
    if (query) return matching;
    const answerer = (f: FilePost) => authors[f.authorId]?.badges.includes("answerer") ?? false;
    return [...matching.filter(answerer), ...matching.filter((f) => !answerer(f))];
  }, [files, section, mediaType, query, authors]);

  return (
    <>
      {!query && (
        <div className="start-here">
          <div>
            <p className="title" style={{ margin: "0 0 2px", fontSize: 14.5 }}>{t("files.startHere")}</p>
            <p className="tiny">{t("files.startHereBody")}</p>
          </div>
          <button className="btn">{t("files.browse")}</button>
        </div>
      )}

      <ChipRow options={sectionOptions} value={section} onChange={setSection} />

      <p className="tiny" style={{ marginBottom: 6 }}>{t("files.filterByType")}</p>
      <ChipRow options={mediaTypeOptions} value={mediaType} onChange={setMediaType} />

      <div className="row between" style={{ marginBottom: 12 }}>
        <p className="title" style={{ margin: 0 }}>{query ? t("files.resultsFor", { query }) : t("files.recommended")}</p>
        <select>
          <option>{t("files.sort.relevant")}</option>
          <option>{t("files.sort.newest")}</option>
          <option>{t("files.sort.discussed")}</option>
        </select>
      </div>

      {filtered.map((file) => {
        const author = authors[file.authorId];
        return (
          <ClickableCard key={file.id} href={`/files/${file.id}`} className="file-card" style={author ? lookStyle(author) : undefined}>
            <div className="preview-img" style={{ overflow: "hidden" }}>
              {file.media?.find((m) => m.kind === "image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/media/${file.media.find((m) => m.kind === "image")!.id}`} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                  {t("files.previewLabel")}
                </>
              )}
            </div>
            <div className="body">
              <div className="row between">
                <Translated type="file" id={file.id} field="title" text={file.title} className="title" style={{ margin: 0 }} />
                <span className="row" style={{ gap: 4 }}>
                  {file.assets.some((a) => a.isGame && a.scanStatus === "clean") && <Badge variant="neutral">{t("game.playable")}</Badge>}
                  {file.madeWithAi && <Badge variant="neutral">{t("badge.madeWithAi")}</Badge>}
                  <Badge>{t(file.authorship === "original" ? "files.badge.original" : file.authorship === "remix" ? "files.badge.remix" : "files.badge.found")}</Badge>
                </span>
              </div>
              <Translated type="file" id={file.id} field="description" text={file.description} className="muted" note />
              <div className="row tiny wrap" style={{ gap: 12 }}>
                {author && <AuthorLink userId={author.id} name={author.name} badges={author.badges} />}
                <span>{t("files.views", { n: file.views.toLocaleString() })}</span>
                <ReportButton targetType="file" targetId={file.id} />
              </div>
            </div>
          </ClickableCard>
        );
      })}

      {filtered.length === 0 && <p className="muted">{t("files.none")}</p>}
    </>
  );
}
