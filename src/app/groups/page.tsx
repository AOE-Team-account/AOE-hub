"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getGroups } from "@/lib/mock-data";
import { Segmented } from "@/components/ui/Segmented";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ReportButton } from "@/components/ui/ReportButton";

export default function GroupsPage() {
  const { requireAuth } = useAuth();
  const [view, setView] = useState<"discover" | "mine">("discover");
  const [joined, setJoined] = useState<Set<string>>(new Set());

  const groups = getGroups();
  const publicGroups = groups.filter((g) => g.visibility === "public");
  const myGroups = groups.filter((g) => joined.has(g.id));

  function toggleJoin(id: string) {
    if (!requireAuth()) return;
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <>
      <Segmented
        options={[
          { value: "discover", label: "Discover" },
          { value: "mine", label: "My groups" },
        ]}
        value={view}
        onChange={setView}
      />
      <div style={{ marginTop: 14 }}>
        {view === "discover" ? (
          <>
            {publicGroups.map((g) => (
              <div className="card row between" key={g.id}>
                <div>
                  <p className="title" style={{ margin: "0 0 2px" }}>{g.name}</p>
                  <p className="tiny">public · {g.memberCount} members</p>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <Button variant="primary" onClick={() => toggleJoin(g.id)}>
                    {joined.has(g.id) ? "Leave" : "Join"}
                  </Button>
                  <ReportButton targetType="group" targetId={g.id} />
                </div>
              </div>
            ))}

            <div className="card" style={{ marginTop: 16 }}>
              <p className="title" style={{ marginBottom: 4 }}>Joining a private group</p>
              <p className="muted" style={{ marginBottom: 10 }}>
                Private groups aren&apos;t listed here — ask a member to send you an invite link or code.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <input placeholder="Enter invite code" style={{ flex: 1 }} />
                <Button variant="primary" onClick={() => requireAuth()}>Join</Button>
              </div>
            </div>

            <Link href="/groups/new">
              <button className="btn" style={{ width: "100%", marginTop: 16 }} onClick={(e) => { if (!requireAuth()) e.preventDefault(); }}>
                + Create a group
              </button>
            </Link>
          </>
        ) : (
          <>
            {myGroups.length === 0 && <p className="muted">You haven&apos;t joined any groups yet.</p>}
            {myGroups.map((g) => (
              <div className="card" key={g.id} style={{ marginBottom: 16 }}>
                <div className="row between">
                  <div className="row" style={{ gap: 8 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="10" width="16" height="10" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    <span className="title" style={{ margin: 0 }}>{g.name}</span>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <Badge>{g.visibility} · {g.memberCount} members</Badge>
                    <ReportButton targetType="group" targetId={g.id} />
                  </div>
                </div>
                <p className="tiny" style={{ margin: "6px 0 10px" }}>
                  {g.visibility === "private"
                    ? "Only visible to members. Discussion only — no file uploads here, and no points."
                    : g.description}
                </p>
                <div className="row" style={{ gap: 8 }}>
                  <Button size="small">Invite someone</Button>
                  <Button size="small" variant="danger" onClick={() => toggleJoin(g.id)}>
                    Leave group
                  </Button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}
