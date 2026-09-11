"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { ChipRow } from "@/components/ui/ChipRow";
import { Segmented } from "@/components/ui/Segmented";
import type { Authorship, FileSection, MediaType } from "@/lib/types";

const MEDIA_TYPES: { value: MediaType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "image", label: "Image" },
  { value: "audio", label: "Audio" },
  { value: "video", label: "Video" },
  { value: "game", label: "Game" },
  { value: "app", label: "App" },
];

const SECTIONS: { value: FileSection; label: string }[] = [
  { value: "curriculum", label: "Curriculum" },
  { value: "games", label: "Games" },
  { value: "books", label: "Books" },
  { value: "cards", label: "Cards" },
  { value: "songs", label: "Songs" },
  { value: "art", label: "Art projects" },
  { value: "printables", label: "Printables" },
  { value: "apps", label: "Apps" },
];

const AUTHORSHIP_OPTIONS: { value: Authorship; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "remix", label: "Remix" },
  { value: "notmine", label: "Not my work" },
];

export default function UploadFilePage() {
  const ready = useRequireAuthPage("/files");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("document");
  const [section, setSection] = useState<FileSection>("curriculum");
  const [authorship, setAuthorship] = useState<Authorship>("original");
  const [fileLabels, setFileLabels] = useState<string[]>([""]);
  const [acknowledged, setAcknowledged] = useState(false);

  if (!ready) return null;

  const canSubmit = acknowledged && title.trim() && description.trim() && fileLabels.some((l) => l.trim());

  return (
    <>
      <BackLink href="/files" label="Cancel" />
      <p className="title" style={{ marginBottom: 14 }}>Upload a file</p>

      <label className="field-label">Title</label>
      <input placeholder="e.g. Early reading phonics workbook" value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="field-label">Description</label>
      <textarea
        placeholder="What is this, and who is it for?"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="field-label">Media type</label>
      <ChipRow options={MEDIA_TYPES} value={mediaType} onChange={setMediaType} />

      <label className="field-label">Section</label>
      <select value={section} onChange={(e) => setSection(e.target.value as FileSection)}>
        {SECTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <label className="field-label">Is this your original work?</label>
      <Segmented options={AUTHORSHIP_OPTIONS} value={authorship} onChange={setAuthorship} />
      {authorship === "remix" && (
        <div style={{ marginTop: 10 }}>
          <input placeholder="Link or title of the original file being remixed" />
        </div>
      )}

      <label className="field-label">Preview picture or video</label>
      <p className="tiny" style={{ marginBottom: 6 }}>
        Shown on the card before someone opens the file — a photo of the finished pages, a screenshot, or a short
        clip works well.
      </p>
      <button className="btn">Choose preview image or video</button> <span className="tiny">no preview chosen</span>

      <label className="field-label">Files</label>
      <p className="tiny" style={{ marginBottom: 8 }}>
        Add every file that belongs together in one post — different languages, different subjects, or a
        chapter-by-chapter curriculum. Each one gets its own label and its own download button.
      </p>
      {fileLabels.map((label, i) => (
        <div className="row" style={{ gap: 8, marginBottom: 8 }} key={i}>
          <input
            placeholder="Label, e.g. 'English version' or 'Chapter 3 - Fractions'"
            style={{ flex: 1 }}
            value={label}
            onChange={(e) => {
              const next = [...fileLabels];
              next[i] = e.target.value;
              setFileLabels(next);
            }}
          />
          <button className="btn small">Choose file</button>
        </div>
      ))}
      <button className="btn small" onClick={() => setFileLabels((l) => [...l, ""])}>
        + Add another file
      </button>

      <div className="card" style={{ background: "var(--bg)", borderStyle: "dashed", marginTop: 18 }}>
        <p className="muted" style={{ marginBottom: 10 }}>
          Everything you post here is free, forever — anyone can view it, download it, and remix it. Are you aware of
          that?
        </p>
        <Button onClick={() => setAcknowledged(true)} disabled={acknowledged}>
          {acknowledged ? "✓ Acknowledged" : "I'm aware, continue"}
        </Button>
      </div>

      <Button
        variant="primary"
        style={{ width: "100%", marginTop: 14 }}
        disabled={!canSubmit}
        onClick={() => router.push("/files")}
      >
        Post to the File Board
      </Button>
    </>
  );
}
