"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBytes } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { UiKey } from "@/lib/i18n/strings";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { GAME_MAX_BYTES } from "@/lib/games";
import { PreviewPicker } from "@/components/ui/PreviewPicker";
import { uploadPreviews } from "@/lib/media-client";
import { sendFile, type SentPart, type UploadInstruction } from "@/lib/upload-client";
import { CONTACT_EMAIL } from "@/lib/site";
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
  { value: "other", key: "files.media.other" },
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
  { value: "other", key: "files.section.other" },
];

const AUTHORSHIP_OPTIONS: { value: Authorship; key: UiKey }[] = [
  { value: "original", key: "upload.authorship.original" },
  { value: "remix", key: "upload.authorship.remix" },
  { value: "notmine", key: "upload.authorship.notmine" },
];

interface FileRow {
  kind: "file" | "link";
  label: string;
  file: File | null;
  url: string;
}

const newRow = (kind: "file" | "link" = "file"): FileRow => ({ kind, label: "", file: null, url: "" });
const usable = (r: FileRow) => (r.kind === "file" ? !!r.file : r.url.trim().length > 0);

export default function UploadFilePage() {
  const { t } = useLanguage();
  const ready = useRequireAuthPage("/files");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("document");
  const [section, setSection] = useState<FileSection>("curriculum");
  const [authorship, setAuthorship] = useState<Authorship>("original");
  const [rows, setRows] = useState<FileRow[]>([newRow()]);
  const [madeWithAi, setMadeWithAi] = useState(false);
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [previewVideos, setPreviewVideos] = useState<File[]>([]);
  const [hosts, setHosts] = useState<{ host: string; name: string }[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState("");
  const [askSent, setAskSent] = useState(false);
  const { user } = useAuth();
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    createClient()
      .from("approved_link_hosts")
      .select("host, name")
      .order("name")
      .then(({ data }) => setHosts((data ?? []) as { host: string; name: string }[]));
  }, []);

  if (!ready) return null;

  const canSubmit = acknowledged && title.trim() && description.trim() && rows.some(usable);

  async function sendAsk() {
    if (!user || !askText.trim()) return;
    const text = askText.trim();
    const { error: insertError } = await createClient()
      .from("link_host_requests")
      .insert({ user_id: user.id, host: text.slice(0, 200), note: text.length > 200 ? text.slice(0, 500) : null });
    if (!insertError) {
      setAskSent(true);
      setAskText("");
    }
  }

  function updateRow(i: number, patch: Partial<FileRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const fileRows = rows.filter((r) => r.kind === "file" && r.file);
    const linkRows = rows.filter((r) => r.kind === "link" && r.url.trim());
    if ((mediaType === "game" || mediaType === "app") && fileRows.some((r) => r.file!.size > GAME_MAX_BYTES)) {
      setError(t("upload.gameTooBig", { size: formatBytes(GAME_MAX_BYTES) }));
      return;
    }
    if (!title.trim() || !description.trim() || fileRows.length + linkRows.length === 0) return;

    setSubmitting(true);
    setError(null);
    setStatusMessage(t("upload.scanning"));
    const fail = (message: string) => {
      setError(message);
      setSubmitting(false);
      setStatusMessage(null);
    };
    const contactEmail = CONTACT_EMAIL ?? "";

    try {
      // 1. Tell the hub what is coming; it checks everything and hands back private upload addresses.
      const res = await fetch("/api/upload/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          section,
          mediaType,
          authorship,
          madeWithAi,
          labels: fileRows.map((r) => r.label || r.file!.name),
          files: fileRows.map((r) => ({ name: r.file!.name, size: r.file!.size, type: r.file!.type })),
          links: linkRows.map((r) => ({ label: r.label, url: r.url.trim() })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "game-too-big") return fail(t("upload.gameTooBig", { size: formatBytes(GAME_MAX_BYTES) }));
        if (data.code === "blocked-type") return fail(t("upload.blockedType"));
        if (data.code === "too-big-media") return fail(t("upload.tooBigMedia", { email: contactEmail }));
        if (data.code === "too-big-document") return fail(t("upload.tooBigDocument", { email: contactEmail }));
        if (data.code === "link-host") return fail(t("upload.linkBadHost"));
        if (data.code === "link-invalid") return fail(t("upload.linkInvalid"));
        if (data.code === "daily-limit") {
          return fail(
            data.filesLeft > 0 && data.bytesLeft > 0
              ? t("upload.limitReached", { files: data.filesLeft, size: formatBytes(data.bytesLeft) })
              : t("upload.limitNone")
          );
        }
        return fail(data.error || t("upload.sendFailed", { email: contactEmail }));
      }

      // 2. Send each file straight to private storage.
      const instructions = data.files as UploadInstruction[];
      const sentParts: { assetId: string; parts: SentPart[] }[] = [];
      for (let i = 0; i < instructions.length; i++) {
        const file = fileRows[i].file!;
        const parts = await sendFile(file, instructions[i], (bytes) =>
          setStatusMessage(t("upload.sending", { name: file.name.slice(0, 30), percent: Math.min(100, Math.round((bytes / file.size) * 100)) }))
        );
        sentParts.push({ assetId: instructions[i].assetId, parts });
      }

      // 3. Say they have all arrived; the hub starts the virus scan.
      if (instructions.length > 0) {
        setStatusMessage(t("upload.scanning"));
        const done = await fetch("/api/upload/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ postId: data.postId, files: sentParts }),
        });
        const doneData = await done.json().catch(() => ({}));
        const failed = ((doneData.results ?? []) as { status: string; code?: string; error?: string }[]).find((r) => r.status === "failed");
        if (!done.ok || failed) {
          if (failed?.code === "game-invalid") return fail(t("upload.gameInvalid", { reason: failed.error ?? "" }));
          return fail(t("upload.sendFailed", { email: contactEmail }));
        }
      }

      const previews = [...previewImages, ...previewVideos];
      if (previews.length > 0) {
        const failedPreviews = await uploadPreviews("file", data.postId, previews, (done, total) =>
          setStatusMessage(t("previews.uploading", { done, total }))
        );
        if (failedPreviews > 0) window.alert(t("previews.failedSome", { n: failedPreviews }));
      }
      router.push(`/files/${data.postId}`);
      router.refresh();
    } catch {
      fail(t("upload.sendFailed", { email: contactEmail }));
    }
  }

  return (
    <>
      <BackLink href="/files" label={t("common.cancel")} />
      <p role="heading" aria-level={2} className="title" style={{ marginBottom: 14 }}>{t("upload.title")}</p>

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
        <div className="row wrap" style={{ gap: 8, marginBottom: 8 }} key={i}>
          <select
            value={row.kind}
            onChange={(e) => updateRow(i, { kind: e.target.value as "file" | "link" })}
            style={{ width: "auto" }}
            aria-label={t("upload.files")}
          >
            <option value="file">{t("upload.rowFile")}</option>
            <option value="link">{t("upload.rowLink")}</option>
          </select>
          <input
            placeholder={t("upload.labelPlaceholder")}
            style={{ flex: 1, minWidth: 160 }}
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
          />
          {row.kind === "file" ? (
            <>
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
            </>
          ) : (
            <input
              placeholder={t("upload.linkUrl")}
              style={{ flex: 2, minWidth: 220 }}
              value={row.url}
              inputMode="url"
              onChange={(e) => updateRow(i, { url: e.target.value })}
            />
          )}
          {rows.length > 1 && (
            <button className="btn small" type="button" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
              {t("upload.linkRemove")}
            </button>
          )}
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => setRows((r) => [...r, newRow()])}>
        {t("upload.addAnother")}
      </button>
      {(mediaType === "game" || mediaType === "app") && (
        <p className="tiny" style={{ marginTop: 10 }}>{t("upload.gameHelp", { size: formatBytes(GAME_MAX_BYTES) })}</p>
      )}
      {rows.some((r) => r.kind === "link") && (
        <div style={{ marginTop: 10 }}>
          <p className="tiny">{t("upload.linkHelp", { sites: hosts.map((h) => h.name).join(", ") || "—" })}</p>
          {!askSent && (
            <button type="button" className="tiny" onClick={() => setAskOpen((v) => !v)} style={{ background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit", fontSize: 12 }}>
              {t("upload.linkAsk")}
            </button>
          )}
          {askOpen && !askSent && (
            <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
              <input style={{ flex: 1, minWidth: 220 }} value={askText} maxLength={500} onChange={(e) => setAskText(e.target.value)} placeholder={t("upload.linkAskPlaceholder")} />
              <Button size="small" onClick={sendAsk} disabled={!askText.trim()}>{t("upload.linkAskSend")}</Button>
            </div>
          )}
          {askSent && <p className="tiny" style={{ color: "var(--accent)" }}>{t("upload.linkAskSent")}</p>}
        </div>
      )}

      <PreviewPicker images={previewImages} videos={previewVideos} onChange={(i, v) => { setPreviewImages(i); setPreviewVideos(v); }} />

      <label className="check-item" style={{ alignItems: "flex-start", marginTop: 16 }}>
        <input type="checkbox" checked={madeWithAi} onChange={(e) => setMadeWithAi(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
        <span>
          {t("upload.madeWithAi")}
          <br />
          <span className="tiny">{t("upload.madeWithAiHelp")}</span>
        </span>
      </label>

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
