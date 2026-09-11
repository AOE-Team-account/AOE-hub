"use client";

import { useState } from "react";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { getOpenAdminReports, getGroups, USERS } from "@/lib/mock-data";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const REASON_LABEL: Record<string, string> = {
  scam: "scam / money request",
  "off-topic": "off-topic",
  inappropriate: "inappropriate content",
  paywalled: "paywalled content",
  copyright: "copyright",
  other: "other",
};

export default function AdminDashboardPage() {
  const ready = useRequireAuthPage("/experience", (user) => user.isAdmin);
  const [groupQuery, setGroupQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const reports = getOpenAdminReports();
  const groups = getGroups();
  const reportedGroups = groups.filter((g) => g.reported);

  const groupResult = groupQuery.trim()
    ? groups.filter((g) => g.name.toLowerCase().includes(groupQuery.toLowerCase()))
    : [];
  const userResult = userQuery.trim()
    ? USERS.filter((u) => u.name.toLowerCase().includes(userQuery.toLowerCase()))
    : [];

  if (!ready) return null;

  return (
    <>
      <p className="tiny" style={{ marginBottom: 14 }}>Visible only to the four admin accounts.</p>

      <p className="label" style={{ fontWeight: 500, marginBottom: 8 }}>Reports queue</p>
      {reports.length === 0 && <p className="muted">No open reports.</p>}
      {reports.map((r) => (
        <div className="card" key={r.id}>
          <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
            <Badge variant="warn">{REASON_LABEL[r.reason]}</Badge>
            <span className="tiny">{new Date(r.createdAt).toLocaleString()}</span>
          </div>
          <p className="muted">{r.details}</p>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <Button>View original ↗</Button>
            <Button variant="danger">Remove content</Button>
            <Button>Warn user</Button>
            <Button>Dismiss</Button>
          </div>
        </div>
      ))}

      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Groups oversight</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        A group only appears here when it&apos;s been reported, or when you search for it by name.
      </p>
      <input placeholder="Search groups by name" value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} />
      {reportedGroups.map((g) => (
        <div className="card row between" key={g.id} style={{ marginTop: 10 }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{g.name}</p>
            <p className="tiny">flagged by a report · {g.visibility} · {g.memberCount} members</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button>View</Button>
            <Button variant="danger">Delete</Button>
          </div>
        </div>
      ))}
      {groupResult.map((g) => (
        <div className="card row between" key={g.id} style={{ marginTop: 10 }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{g.name}</p>
            <p className="tiny">{g.visibility} · {g.memberCount} members</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button>View</Button>
            <Button variant="danger">Delete</Button>
          </div>
        </div>
      ))}

      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Users</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        Same rule — an account only shows up here if it&apos;s been reported, or if you search for it directly.
      </p>
      <input placeholder="Search by name, email, or phone" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
      {userResult.map((u) => (
        <div className="card row between" key={u.id} style={{ marginTop: 10 }}>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{u.name}</p>
            <p className="tiny">joined {new Date(u.memberSince).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Button>View profile</Button>
            <Button variant="danger">Delete account</Button>
          </div>
        </div>
      ))}
    </>
  );
}
