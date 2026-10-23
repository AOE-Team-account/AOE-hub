"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { PointsInfoButton } from "@/components/profile/PointsInfoButton";
import { VerifiedPinsCard } from "@/components/profile/VerifiedPinsCard";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/profile/Avatar";
import { BACKGROUND_CODES, FONT_CODES, FRAME_CODES, lookStyle } from "@/lib/profile-look";
import { formatBytes } from "@/lib/format";
import type { UiKey } from "@/lib/i18n/strings";
import type { ExperiencePost, FilePost } from "@/lib/types";

export default function ProfilePage() {
  const { t, lang } = useLanguage();
  const { user, refreshProfile } = useAuth();
  useRequireAuthPage("/");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [frame, setFrame] = useState("none");
  const [background, setBackground] = useState("none");
  const [postFont, setPostFont] = useState("default");
  const [pictureMsg, setPictureMsg] = useState<string | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [myFiles, setMyFiles] = useState<FilePost[]>([]);
  const [myPosts, setMyPosts] = useState<ExperiencePost[]>([]);

  useEffect(() => {
    // Seeds the edit form from the auth-provided user once it's loaded —
    // can't be known until the async session/profile fetch resolves.
    if (user) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(user.name);
      setDisplayName(user.displayName ?? "");
      setFrame(user.frame);
      setBackground(user.background);
      setPostFont(user.postFont);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [{ data: files }, { data: posts }] = await Promise.all([
        supabase.from("file_posts").select("*").eq("author_id", user.id).order("created_at", { ascending: false }),
        supabase
          .from("experience_posts")
          .select("*")
          .eq("author_id", user.id)
          .eq("is_announcement", false)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setMyFiles(
        (files ?? []).map((f) => ({
          id: f.id,
          title: f.title,
          description: f.description,
          section: f.section,
          mediaType: f.media_type,
          authorship: f.authorship,
          remixOfPostId: f.remix_of_post_id ?? undefined,
          authorId: f.author_id,
          views: f.views,
          createdAt: f.created_at,
          updatedAt: f.updated_at ?? undefined,
          assets: [],
        }))
      );
      setMyPosts(
        (posts ?? []).map((p) => ({
          id: p.id,
          authorId: p.author_id,
          category: p.category ?? "just-sharing",
          title: p.title ?? undefined,
          body: p.body,
          views: p.views,
          replyCount: 0,
          createdAt: p.created_at,
          pinned: p.pinned,
          isAnnouncement: p.is_announcement,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ name: name.trim(), display_name: displayName.trim() || null, profile_frame: frame, profile_background: background, post_font: postFont }).eq("id", user.id);
    setSaving(false);
    setEditing(false);
    await refreshProfile();
  }

  async function uploadPicture(file: File | undefined) {
    if (!file) return;
    setPictureBusy(true);
    setPictureMsg(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/profile/picture", { method: "POST", body: form });
    setPictureBusy(false);
    if (!res.ok) return setPictureMsg(t("profile.pictureError", { size: formatBytes(5 * 1024 * 1024) }));
    await refreshProfile();
  }

  async function removePicture() {
    setPictureBusy(true);
    await fetch("/api/profile/picture", { method: "DELETE" });
    setPictureBusy(false);
    await refreshProfile();
  }

  async function deleteFile(id: string) {
    if (!confirm(t("profile.confirmDeleteFile"))) return;
    const res = await fetch("/api/my-content/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "file", id }) });
    if (!res.ok) return window.alert(t("profile.deleteFailed"));
    setMyFiles((files) => files.filter((f) => f.id !== id));
  }

  async function deletePost(id: string) {
    if (!confirm(t("profile.confirmDeletePost"))) return;
    const res = await fetch("/api/my-content/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "post", id }) });
    if (!res.ok) return window.alert(t("profile.deleteFailed"));
    setMyPosts((posts) => posts.filter((p) => p.id !== id));
  }

  return (
    <>
      <div className="card row between" style={lookStyle({ background: user.background, postFont: user.postFont })}>
        <div className="row" style={{ gap: 14 }}>
          <Avatar userId={user.id} initials={user.initials} avatarV={user.avatarV} frame={user.frame} />
          <div>
            <p className="title" style={{ margin: 0, color: "inherit" }}>{user.name}</p>
            <p className="tiny" style={{ color: "inherit", opacity: 0.8 }}>
              {t("profile.memberSince", { date: new Date(user.memberSince).toLocaleDateString(lang, { month: "long", year: "numeric" }) })}
            </p>
          </div>
        </div>
        <Button size="small" onClick={() => setEditing((e) => !e)}>{t("profile.edit")}</Button>
      </div>

      <div className={`compose-inline${editing ? " open" : ""}`}>
        <label className="field-label" style={{ marginTop: 0 }}>{t("profile.picture")}</label>
        <div className="row wrap" style={{ gap: 8 }}>
          <label className="btn small" style={{ cursor: "pointer" }}>
            {pictureBusy ? t("common.saving") : t("profile.choosePicture")}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} disabled={pictureBusy} onChange={(e) => { uploadPicture(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {user.avatarV && <button className="btn small" type="button" disabled={pictureBusy} onClick={removePicture}>{t("profile.removePicture")}</button>}
        </div>
        <p className="tiny" style={{ marginTop: 4 }}>{t("profile.pictureHelp")}</p>
        {pictureMsg && <p className="tiny" style={{ color: "#b5471f" }}>{pictureMsg}</p>}
        <label className="field-label">{t("profile.frame")}</label>
        <select value={frame} onChange={(e) => setFrame(e.target.value)}>
          {FRAME_CODES.map((c) => <option key={c} value={c}>{t(`profile.frame.${c}` as UiKey)}</option>)}
        </select>
        <label className="field-label">{t("profile.background")}</label>
        <select value={background} onChange={(e) => setBackground(e.target.value)}>
          {BACKGROUND_CODES.map((c) => <option key={c} value={c}>{t(`profile.background.${c}` as UiKey)}</option>)}
        </select>
        <label className="field-label">{t("profile.font")}</label>
        <select value={postFont} onChange={(e) => setPostFont(e.target.value)}>
          {FONT_CODES.map((c) => <option key={c} value={c}>{t(`profile.font.${c}` as UiKey)}</option>)}
        </select>
        <p className="tiny" style={{ marginTop: 6 }}>{t("profile.lookHelp")}</p>
        <label className="field-label">{t("profile.name")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label className="field-label">{t("profile.displayName")}</label>
        <input
          placeholder={t("profile.displayNamePlaceholder")}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Button variant="primary" size="small" style={{ marginTop: 12 }} disabled={saving} onClick={saveProfile}>
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>

      {(user.roles.includes("creator") || user.roles.includes("watcher") || user.roles.includes("deacon")) && (
        <div className="card row wrap" style={{ gap: 8 }}>
          {/* Only the person themselves ever sees these; the panel pages
              re-check the role on the server for every request. */}
          {user.roles.includes("creator") && <Link href="/creator" className="btn small">{t("profile.openCreator")}</Link>}
          {user.roles.includes("watcher") && <Link href="/mod" className="btn small">{t("profile.openWatcher")}</Link>}
          {!user.roles.includes("watcher") && user.roles.includes("deacon") && (
            <Link href="/mod" className="btn small">{t("profile.openDeacon")}</Link>
          )}
        </div>
      )}

      {user.badges.includes("verified") && <VerifiedPinsCard />}

      <div className="card row wrap" style={{ gap: 18 }}>
        <Stat label={t("profile.points")} value={user.points.toLocaleString()} />
        <Stat label={t("profile.files")} value={String(myFiles.length)} />
        <Stat label={t("profile.followers")} value={user.followers.toLocaleString()} />
        <Stat label={t("profile.following")} value={user.following.toLocaleString()} />
      </div>
      <PointsInfoButton />
      <p className="tiny" style={{ marginBottom: 12 }}><Link href="/appeal" style={{ color: "var(--accent)" }}>{t("appeal.link")}</Link></p>

      <p className="label" style={{ fontWeight: 500, margin: "0 0 8px" }}>{t("profile.myFiles")}</p>
      {myFiles.length === 0 && <p className="muted">{t("profile.noFiles")}</p>}
      {myFiles.map((f) => (
        <div className="card row between" key={f.id}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{f.title}</p>
            <p className="tiny">{t("files.views", { n: f.views.toLocaleString() })}</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="small">{t("profile.update")}</Button>
            <Button size="small" variant="danger" onClick={() => deleteFile(f.id)}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
      ))}

      <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>{t("profile.myPosts")}</p>
      {myPosts.length === 0 && <p className="muted">{t("profile.noPosts")}</p>}
      {myPosts.map((p) => (
        <div className="card row between" key={p.id}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{p.title ?? p.body.slice(0, 60)}</p>
            <p className="tiny">{t("exp.viewsReplies", { views: p.views.toLocaleString(), replies: p.replyCount })}</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="small">{t("profile.update")}</Button>
            <Button size="small" variant="danger" onClick={() => deletePost(p.id)}>
              {t("common.delete")}
            </Button>
          </div>
        </div>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-block">
      <p className="tiny" style={{ margin: 0 }}>{label}</p>
      <p className="title" style={{ margin: 0 }}>{value}</p>
    </div>
  );
}
