"use client";

import { useState } from "react";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { getFilePosts, getExperiencePosts } from "@/lib/mock-data";
import { PointsInfoButton } from "@/components/profile/PointsInfoButton";
import { Button } from "@/components/ui/Button";

export default function ProfilePage() {
  const { user } = useAuth();
  useRequireAuthPage("/");
  const [editing, setEditing] = useState(false);
  const [deletedFiles, setDeletedFiles] = useState<Set<string>>(new Set());
  const [deletedPosts, setDeletedPosts] = useState<Set<string>>(new Set());

  if (!user) return null;

  const myFiles = getFilePosts().filter((f) => f.authorId === user.id && !deletedFiles.has(f.id));
  const myPosts = getExperiencePosts().filter((p) => p.authorId === user.id && !p.isAnnouncement && !deletedPosts.has(p.id));

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
        <input defaultValue={user.name} />
        <label className="field-label">Display name</label>
        <input placeholder="How you'd like to appear on posts, e.g. 'Sarah's Homeschool'" />
        <Button variant="primary" size="small" style={{ marginTop: 12 }} onClick={() => setEditing(false)}>
          Save
        </Button>
      </div>

      <div className="card row wrap" style={{ gap: 18 }}>
        <Stat label="points" value={user.points.toLocaleString()} />
        <Stat label="files" value={String(user.filesCount)} />
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
            <Button
              size="small"
              variant="danger"
              onClick={() => {
                if (confirm("Delete this file? This cannot be undone.")) {
                  setDeletedFiles((s) => new Set(s).add(f.id));
                }
              }}
            >
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
            <Button
              size="small"
              variant="danger"
              onClick={() => {
                if (confirm("Delete this post? This cannot be undone.")) {
                  setDeletedPosts((s) => new Set(s).add(p.id));
                }
              }}
            >
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
