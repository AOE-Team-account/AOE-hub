"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { ChipRow } from "@/components/ui/ChipRow";
import { Segmented } from "@/components/ui/Segmented";
import type { Authorship, FileSection, MediaType } from "@/lib/types";

const MEDIA_TYPES: { value: MediaType; key: UiKey }[] = [
  { value: "document", key: "files.media.document" },
  { value: "image", key: "files.media.image" },
  { value: "audio", key: "files.media.audio" },
  { value: "video", key: "files.media.video" },
  { value: "game", key: "files.media.gameOnly" },
  { value: "app", key: "files.media.app" },
];

const SECTIONS: { value: FileSection; key: UiKey }[] = [
  { value: "curriculum", key: "files.section.curriculum" },
  { value: "games", key: "files.section.games" },
  { value: "books", key: "files.section.books" },
  { value: "cards", key: "files.section.cards" },
  { value: "songs", key: "files.section.songs" },
  { value: "art", key: "files.section.art" },
  { value: "printables", key: "files.section.printables" },
  { value: "apps", key: "files.section.apps" },
];

const AUTHORSHIP_OPTIONS: { value: Authorship; key: UiKey }[] = [
  { value: "original", key: "upload.authorship.original" },
  { value: "remix", key: "upload.authorship.remix" },
  { value: "notmine", key: "upload.authorship.notmine" },
];

interface FileRow {
  label: string;
  file: File | null;
}

export default function UploadFilePage() {
  const { t } = useLanguage();
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
    setStatusMessage(t("upload.scanning"));

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
        setError(data.error || t("upload.failed"));
        setSubmitting(false);
        setStatusMessage(null);
        return;
      }
      const flagged = (data.results as { label: string; scanStatus: string }[]).filter((r) => r.scanStatus === "flagged");
      if (flagged.length > 0) {
        setStatusMessage(t("upload.flagged", { labels: flagged.map((f) => f.label).join(", ") }));
      }
      router.push(`/files/${data.postId}`);
      router.refresh();
    } catch {
      setError(t("upload.wentWrong"));
      setSubmitting(false);
      setStatusMessage(null);
    }
  }

  return (
    <>
      <BackLink href="/files" label={t("common.cancel")} />
      <p className="title" style={{ marginBottom: 14 }}>{t("upload.title")}</p>

      <label className="field-label">{t("upload.titleLabel")}</label>
      <input placeholder={t("upload.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />

      <label className="field-label">{t("upload.description")}</label>
      <textarea
        placeholder={t("upload.descriptionPlaceholder")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <label className="field-label">{t("upload.mediaType")}</label>
      <ChipRow options={MEDIA_TYPES.map((o) => ({ value: o.value, label: t(o.key) }))} value={mediaType} onChange={setMediaType} />

      <label className="field-label">{t("upload.section")}</label>
      <select value={section} onChange={(e) => setSection(e.target.value as FileSection)}>
        {SECTIONS.map((s) => (
          <option key={s.value} value={s.value}>{t(s.key)}</option>
        ))}
      </select>

      <label className="field-label">{t("upload.originalQ")}</label>
      <Segmented options={AUTHORSHIP_OPTIONS.map((o) => ({ value: o.value, label: t(o.key) }))} value={authorship} onChange={setAuthorship} />
      {authorship === "remix" && (
        <div style={{ marginTop: 10 }}>
          <input placeholder={t("upload.remixPlaceholder")} />
        </div>
      )}

      <label className="field-label">{t("upload.files")}</label>
      <p className="tiny" style={{ marginBottom: 8 }}>
        {t("upload.filesHelp")}
      </p>
      {rows.map((row, i) => (
        <div className="row" style={{ gap: 8, marginBottom: 8 }} key={i}>
          <input
            placeholder={t("upload.labelPlaceholder")}
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
            {row.file ? row.file.name.slice(0, 20) : t("upload.chooseFile")}
          </button>
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => setRows((r) => [...r, { label: "", file: null }])}>
        {t("upload.addAnother")}
      </button>

      <div className="card" style={{ background: "var(--bg)", borderStyle: "dashed", marginTop: 18 }}>
        <p className="muted" style={{ marginBottom: 10 }}>
          {t("upload.freeNotice")}
        </p>
        <Button onClick={() => setAcknowledged(true)} disabled={acknowledged}>
          {acknowledged ? t("upload.acknowledged") : t("upload.aware")}
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
        {submitting ? t("upload.uploading") : t("upload.post")}
      </Button>
    </>
  );
}
