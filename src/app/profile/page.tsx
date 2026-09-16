"use client";

import { useEffect, useState } from "react";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { PointsInfoButton } from "@/components/profile/PointsInfoButton";
import { Button } from "@/components/ui/Button";
import type { ExperiencePost, FilePost } from "@/lib/types";

export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
  useRequireAuthPage("/");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
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
    await supabase.from("profiles").update({ name: name.trim(), display_name: displayName.trim() || null }).eq("id", user.id);
    setSaving(false);
    setEditing(false);
    await refreshProfile();
  }

  async function deleteFile(id: string) {
    if (!confirm("Delete this file? This cannot be undone.")) return;
    const supabase = createClient();
    await supabase.from("file_posts").delete().eq("id", id);
    setMyFiles((files) => files.filter((f) => f.id !== id));
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post? This cannot be undone.")) return;
    const supabase = createClient();
    await supabase.from("experience_posts").delete().eq("id", id);
    setMyPosts((posts) => posts.filter((p) => p.id !== id));
  }

  return (
    <>
      <div className="card row between">
        <div className="row" style={{ gap: 14 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "var(--accent)",
              color: "var(--accent-text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontFamily: "var(--font-heading)",
              flexShrink: 0,
            }}
          >
            {user.initials}
          </div>
          <div>
            <p className="title" style={{ margin: 0 }}>{user.name}</p>
            <p className="tiny">
              member since {new Date(user.memberSince).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <Button size="small" onClick={() => setEditing((e) => !e)}>Edit profile</Button>
      </div>

      <div className={`compose-inline${editing ? " open" : ""}`}>
        <label className="field-label" style={{ marginTop: 0 }}>Profile picture</label>
        <button className="btn small">Choose new picture</button>
        <label className="field-label">Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label className="field-label">Display name</label>
        <input
          placeholder="How you'd like to appear on posts, e.g. 'Sarah's Homeschool'"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <Button variant="primary" size="small" style={{ marginTop: 12 }} disabled={saving} onClick={saveProfile}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      <div className="card row wrap" style={{ gap: 18 }}>
        <Stat label="points" value={user.points.toLocaleString()} />
        <Stat label="files" value={String(myFiles.length)} />
        <Stat label="groups" value={String(user.groupsCount)} />
        <Stat label="followers" value={user.followers.toLocaleString()} />
        <Stat label="following" value={user.following.toLocaleString()} />
      </div>
      <PointsInfoButton />

      <p className="label" style={{ fontWeight: 500, margin: "0 0 8px" }}>My files</p>
      {myFiles.length === 0 && <p className="muted">No files yet.</p>}
      {myFiles.map((f) => (
        <div className="card row between" key={f.id}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{f.title}</p>
            <p className="tiny">{f.views.toLocaleString()} views</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="small">Update</Button>
            <Button size="small" variant="danger" onClick={() => deleteFile(f.id)}>
              Delete
            </Button>
          </div>
        </div>
      ))}

      <p className="label" style={{ fontWeight: 500, margin: "18px 0 8px" }}>My posts</p>
      {myPosts.length === 0 && <p className="muted">No posts yet.</p>}
      {myPosts.map((p) => (
        <div className="card row between" key={p.id}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{p.title ?? p.body.slice(0, 60)}</p>
            <p className="tiny">{p.views.toLocaleString()} views · {p.replyCount} replies</p>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Button size="small">Update</Button>
            <Button size="small" variant="danger" onClick={() => deletePost(p.id)}>
              Delete
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
