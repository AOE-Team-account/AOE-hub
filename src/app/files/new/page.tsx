"use client";

import { useRef, useState } from "react";
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

interface FileRow {
  label: string;
  file: File | null;
}

export default function UploadFilePage() {
  const ready = useRequireAuthPage("/files");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("document");
  const [section, setSection] = useState<FileSection>("curriculum");
  const [authorship, setAuthorship] = useState<Authorship>("original");
  const [rows, setRows] = useState<FileRow[]>([{ label: "", file: null }]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  if (!ready) return null;

  const canSubmit = acknowledged && title.trim() && description.trim() && rows.some((r) => r.file);

  function updateRow(i: number, patch: Partial<FileRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const usableRows = rows.filter((r) => r.file);
    if (!title.trim() || !description.trim() || usableRows.length === 0) return;

    setSubmitting(true);
    setError(null);
    setStatusMessage("Scanning files for malware — this can take up to a minute per file…");

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("description", description.trim());
    formData.set("section", section);
    formData.set("mediaType", mediaType);
    formData.set("authorship", authorship);
    formData.set("labels", JSON.stringify(usableRows.map((r) => r.label || r.file!.name)));
    usableRows.forEach((r) => formData.append("files", r.file!));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed.");
        setSubmitting(false);
        setStatusMessage(null);
        return;
      }
      const flagged = (data.results as { label: string; scanStatus: string }[]).filter((r) => r.scanStatus === "flagged");
      if (flagged.length > 0) {
        setStatusMessage(
          `Posted, but ${flagged.map((f) => f.label).join(", ")} failed the malware scan and won't be downloadable.`
        );
      }
      router.push(`/files/${data.postId}`);
      router.refresh();
    } catch {
      setError("Something went wrong uploading. Please try again.");
      setSubmitting(false);
      setStatusMessage(null);
    }
  }

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

      <label className="field-label">Files</label>
      <p className="tiny" style={{ marginBottom: 8 }}>
        Add every file that belongs together in one post — different languages, different subjects, or a
        chapter-by-chapter curriculum. Each one gets its own label and its own download button. Every file is
        scanned for malware before it becomes downloadable.
      </p>
      {rows.map((row, i) => (
        <div className="row" style={{ gap: 8, marginBottom: 8 }} key={i}>
          <input
            placeholder="Label, e.g. 'English version' or 'Chapter 3 - Fractions'"
            style={{ flex: 1 }}
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
          />
          <input
            ref={(el) => {
              fileInputRefs.current[i] = el;
            }}
            type="file"
            style={{ display: "none" }}
            onChange={(e) => updateRow(i, { file: e.target.files?.[0] ?? null })}
          />
          <button className="btn small" type="button" onClick={() => fileInputRefs.current[i]?.click()}>
            {row.file ? row.file.name.slice(0, 20) : "Choose file"}
          </button>
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => setRows((r) => [...r, { label: "", file: null }])}>
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

      {statusMessage && (
        <p className="muted" style={{ marginTop: 10 }}>
          {statusMessage}
        </p>
      )}
      {error && (
        <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
          {error}
        </p>
      )}

      <Button variant="primary" style={{ width: "100%", marginTop: 14 }} disabled={!canSubmit || submitting} onClick={submit}>
        {submitting ? "Uploading…" : "Post to the File Board"}
      </Button>
    </>
  );
}
