"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { platformName } from "@/lib/buzzora/platforms";
import type { BuzzKind, VideoPlatform } from "@/lib/types";

/** True for the Creator and Watchers (the only people who may post to the Buzzora Board or add a video link). */
export function useIsBuzzStaff(): boolean {
  const { user } = useAuth();
  return !!user?.roles.some((r) => r === "creator" || r === "watcher");
}

const KINDS: BuzzKind[] = ["news", "law", "regulation"];

/** Creator / Watcher form: post to the Buzzora Board by hand. */
export function BuzzComposer() {
  const staff = useIsBuzzStaff();
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "news" as BuzzKind, country: "", title: "", summary: "", limits: "", sourcePublisher: "", sourceTitle: "", sourceUrl: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  if (!staff) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(false);
    const res = await fetch("/api/buzzora/post", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!res.ok) return setError(true);
    setOpen(false);
    setF({ kind: "news", country: "", title: "", summary: "", limits: "", sourcePublisher: "", sourceTitle: "", sourceUrl: "" });
    router.refresh();
  }

  if (!open) return <div style={{ marginBottom: 10 }}><Button onClick={() => setOpen(true)}>{t("buzz.new.open")}</Button></div>;
  return (
    <form className="card" onSubmit={submit}>
      <p role="heading" aria-level={2} className="title">{t("buzz.new.title")}</p>
      <label className="field-label">{t("buzz.new.kind")}</label>
      <select value={f.kind} onChange={set("kind")}>{KINDS.map((k) => <option key={k} value={k}>{t(`buzz.tab.${k}` as const)}</option>)}</select>
      <label className="field-label">{t("buzz.new.country")}</label>
      <input required value={f.country} onChange={set("country")} maxLength={60} />
      <label className="field-label">{t("buzz.new.headline")}</label>
      <input required value={f.title} onChange={set("title")} maxLength={140} />
      <label className="field-label">{t("buzz.new.summary")}</label>
      <textarea required value={f.summary} onChange={set("summary")} rows={5} maxLength={1600} />
      <label className="field-label">{t("buzz.new.limits")}</label>
      <textarea value={f.limits} onChange={set("limits")} rows={2} maxLength={600} />
      <label className="field-label">{t("buzz.new.publisher")}</label>
      <input required value={f.sourcePublisher} onChange={set("sourcePublisher")} maxLength={80} />
      <label className="field-label">{t("buzz.new.sourceTitle")}</label>
      <input value={f.sourceTitle} onChange={set("sourceTitle")} maxLength={200} />
      <label className="field-label">{t("buzz.new.sourceUrl")}</label>
      <input required type="url" pattern="https://.*" value={f.sourceUrl} onChange={set("sourceUrl")} />
      {error && <p className="muted" role="alert" style={{ color: "#b5471f" }}>{t("buzz.new.error")}</p>}
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? t("buzz.new.posting") : t("buzz.new.post")}</Button>
        <Button type="button" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
      </div>
    </form>
  );
}

/** Creator / Watcher: move a Buzzora post to another tab or fix its country. */
export function BuzzMove({ postId, kind, country }: { postId: string; kind?: BuzzKind; country?: string }) {
  const staff = useIsBuzzStaff();
  const { t } = useLanguage();
  const router = useRouter();
  const [k, setK] = useState<BuzzKind>(kind ?? "news");
  const [c, setC] = useState(country ?? "");
  const [msg, setMsg] = useState("");
  if (!staff) return null;
  async function save() {
    const res = await fetch(`/api/buzzora/post/${postId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: k, country: c }) });
    setMsg(res.ok ? t("buzz.move.saved") : t("buzz.new.error"));
    if (res.ok) router.refresh();
  }
  return (
    <div className="card">
      <p className="tiny" style={{ margin: "0 0 6px", fontWeight: 600 }}>{t("buzz.move.label")}</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <select aria-label={t("buzz.new.kind")} value={k} onChange={(e) => setK(e.target.value as BuzzKind)} style={{ width: "auto" }}>{KINDS.map((x) => <option key={x} value={x}>{t(`buzz.tab.${x}` as const)}</option>)}</select>
        <input aria-label={t("buzz.country.label")} value={c} onChange={(e) => setC(e.target.value)} maxLength={60} style={{ width: 200 }} />
        <Button size="small" onClick={save}>{t("buzz.move.save")}</Button>
        {msg && <span className="tiny">{msg}</span>}
      </div>
    </div>
  );
}

/** Creator / Watcher: paste a link to a video on YouTube, bilibili, TikTok, 小红书, WeChat or Facebook. */
export function VideoLinkTool() {
  const staff = useIsBuzzStaff();
  const { t } = useLanguage();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<{ platform: VideoPlatform; title: string; author: string } | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!staff) return null;

  async function check() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/video-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, preview: true }) });
    setBusy(false);
    if (!res.ok) { setFound(null); return setMsg(t("video.add.error")); }
    const j = (await res.json()) as { platform: VideoPlatform; title: string; author: string };
    setFound(j); setTitle(j.title);
  }
  async function post() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/video-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, title, note }) });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setMsg(j.error ?? t("video.add.error"));
    setMsg(t("video.add.done")); setUrl(""); setFound(null); setTitle(""); setNote(""); setOpen(false);
    router.refresh();
  }

  if (!open) return <div style={{ marginBottom: 10 }}><Button onClick={() => setOpen(true)}>{t("video.add.open")}</Button>{msg && <span className="tiny" style={{ marginLeft: 8 }}>{msg}</span>}</div>;
  return (
    <div className="card">
      <p role="heading" aria-level={2} className="title">{t("video.add.title")}</p>
      <label className="field-label">{t("video.add.url")}</label>
      <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setFound(null); }} placeholder="https://" />
      {!found && <div style={{ marginTop: 10 }}><Button onClick={check} disabled={busy || !url}>{t("video.add.check")}</Button></div>}
      {found && (
        <>
          <p className="tiny" style={{ marginTop: 8 }}>{t("video.add.platform", { platform: platformName(found.platform) })}</p>
          {!found.title && <p className="tiny">{t("video.add.noTitle")}</p>}
          <label className="field-label">{t("video.add.titleLabel")}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          <label className="field-label">{t("video.add.note")}</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={400} />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <Button variant="primary" onClick={post} disabled={busy || title.trim().length < 3}>{t("video.add.post")}</Button>
          </div>
        </>
      )}
      {msg && <p className="muted" role="alert" style={{ color: "#b5471f" }}>{msg}</p>}
      <div style={{ marginTop: 10 }}><Button size="small" onClick={() => setOpen(false)}>{t("common.cancel")}</Button></div>
    </div>
  );
}
