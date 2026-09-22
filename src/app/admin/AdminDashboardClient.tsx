"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { userFromProfileRow, type ProfileRow } from "@/lib/profile";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AdminAssistantPanel } from "./AdminAssistantPanel";
import {
  deleteGroup,
  deleteUserAccount,
  dismissReport,
  removeReportedContent,
  reportTargetHref,
  warnReportedUser,
} from "@/lib/data/moderation";
import type { AdminReport, Group, User } from "@/lib/types";

const REASON_LABEL: Record<string, string> = {
  scam: "scam / money request",
  "off-topic": "off-topic",
  inappropriate: "inappropriate content",
  paywalled: "paywalled content",
  copyright: "copyright",
  other: "other",
};

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  visibility: Group["visibility"];
  reported: boolean;
  created_at: string;
}

export function AdminDashboardClient({ reports, reportedGroups }: { reports: AdminReport[]; reportedGroups: Group[] }) {
  const ready = useRequireAuthPage("/experience", (user) => user.isAdmin);
  const [reportList, setReportList] = useState(reports);
  const [reportError, setReportError] = useState<Record<string, string>>({});
  const [reportBusy, setReportBusy] = useState<string | null>(null);

  const [groupQuery, setGroupQuery] = useState("");
  const [userQuery, setUserQuery] = useState("");
  const [groupResult, setGroupResult] = useState<Group[]>([]);
  const [userResult, setUserResult] = useState<User[]>([]);
  const [reportedGroupList, setReportedGroupList] = useState(reportedGroups);
  const [groupBusy, setGroupBusy] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<Record<string, string>>({});
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [userError, setUserError] = useState<Record<string, string>>({});

  useEffect(() => {
    // Live search against Supabase as the admin types — this can only
    // happen in an effect since it depends on network data, not local state.
    const q = groupQuery.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupResult([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("groups").select("*").ilike("name", `%${q}%`);
      if (cancelled) return;
      const rows = (data ?? []) as GroupRow[];
      const withCounts = await Promise.all(
        rows.map(async (row) => {
          const { data: count } = await supabase.rpc("group_member_count", { p_group_id: row.id });
          const group: Group = {
            id: row.id,
            name: row.name,
            description: row.description ?? "",
            visibility: row.visibility,
            memberCount: count ?? 0,
            createdAt: row.created_at,
            reported: row.reported,
          };
          return group;
        })
      );
      if (!cancelled) setGroupResult(withCounts);
    })();
    return () => {
      cancelled = true;
    };
  }, [groupQuery]);

  useEffect(() => {
    const q = userQuery.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUserResult([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("*").ilike("name", `%${q}%`);
      if (!cancelled) setUserResult((data ?? []).map((row) => userFromProfileRow(row as ProfileRow)));
    })();
    return () => {
      cancelled = true;
    };
  }, [userQuery]);

  async function handleRemoveContent(report: AdminReport) {
    setReportBusy(report.id);
    setReportError((e) => ({ ...e, [report.id]: "" }));
    const { error } = await removeReportedContent(report);
    setReportBusy(null);
    if (error) return setReportError((e) => ({ ...e, [report.id]: error }));
    setReportList((rs) => rs.filter((r) => r.id !== report.id));
  }

  async function handleWarnUser(report: AdminReport) {
    setReportBusy(report.id);
    setReportError((e) => ({ ...e, [report.id]: "" }));
    const { error } = await warnReportedUser(report);
    setReportBusy(null);
    if (error) return setReportError((e) => ({ ...e, [report.id]: error }));
    setReportList((rs) => rs.filter((r) => r.id !== report.id));
  }

  async function handleDismiss(report: AdminReport) {
    setReportBusy(report.id);
    setReportError((e) => ({ ...e, [report.id]: "" }));
    const { error } = await dismissReport(report.id);
    setReportBusy(null);
    if (error) return setReportError((e) => ({ ...e, [report.id]: error }));
    setReportList((rs) => rs.filter((r) => r.id !== report.id));
  }

  async function handleDeleteGroup(groupId: string) {
    setGroupBusy(groupId);
    setGroupError((e) => ({ ...e, [groupId]: "" }));
    const { error } = await deleteGroup(groupId);
    setGroupBusy(null);
    if (error) return setGroupError((e) => ({ ...e, [groupId]: error }));
    setReportedGroupList((gs) => gs.filter((g) => g.id !== groupId));
    setGroupResult((gs) => gs.filter((g) => g.id !== groupId));
  }

  async function handleDeleteUser(userId: string) {
    setUserBusy(userId);
    setUserError((e) => ({ ...e, [userId]: "" }));
    const { error } = await deleteUserAccount(userId);
    setUserBusy(null);
    if (error) return setUserError((e) => ({ ...e, [userId]: error }));
    setUserResult((us) => us.filter((u) => u.id !== userId));
  }

  if (!ready) return null;

  return (
    <>
      <p className="tiny" style={{ marginBottom: 14 }}>Visible only to the four admin accounts.</p>

      <p className="label" style={{ fontWeight: 500, marginBottom: 8 }}>Reports queue</p>
      {reportList.length === 0 && <p className="muted">No open reports.</p>}
      {reportList.map((r) => {
        const href = reportTargetHref(r);
        const busy = reportBusy === r.id;
        return (
          <div className="card" key={r.id}>
            <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
              <Badge variant="warn">{REASON_LABEL[r.reason]}</Badge>
              <span className="tiny">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
            <p className="muted">{r.details}</p>
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              {href ? (
                <Link href={href} className="btn">View original ↗</Link>
              ) : (
                <Button disabled>View original ↗</Button>
              )}
              {r.targetType !== "user" && (
                <Button variant="danger" disabled={busy} onClick={() => handleRemoveContent(r)}>
                  Remove content
                </Button>
              )}
              <Button disabled={busy} onClick={() => handleWarnUser(r)}>Warn user</Button>
              <Button disabled={busy} onClick={() => handleDismiss(r)}>Dismiss</Button>
            </div>
            {reportError[r.id] && <p className="tiny" style={{ color: "#b5471f", marginTop: 8 }}>{reportError[r.id]}</p>}
          </div>
        );
      })}

      <AdminAssistantPanel />

      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Groups oversight</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        A group only appears here when it&apos;s been reported, or when you search for it by name.
      </p>
      <input placeholder="Search groups by name" value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} />
      {reportedGroupList.map((g) => (
        <div key={g.id}>
          <div className="card row between" style={{ marginTop: 10 }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{g.name}</p>
              <p className="tiny">flagged by a report · {g.visibility} · {g.memberCount} members</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link href="/groups" className="btn">View</Link>
              <Button variant="danger" disabled={groupBusy === g.id} onClick={() => handleDeleteGroup(g.id)}>Delete</Button>
            </div>
          </div>
          {groupError[g.id] && <p className="tiny" style={{ color: "#b5471f", marginTop: 4 }}>{groupError[g.id]}</p>}
        </div>
      ))}
      {groupResult.map((g) => (
        <div key={g.id}>
          <div className="card row between" style={{ marginTop: 10 }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{g.name}</p>
              <p className="tiny">{g.visibility} · {g.memberCount} members</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link href="/groups" className="btn">View</Link>
              <Button variant="danger" disabled={groupBusy === g.id} onClick={() => handleDeleteGroup(g.id)}>Delete</Button>
            </div>
          </div>
          {groupError[g.id] && <p className="tiny" style={{ color: "#b5471f", marginTop: 4 }}>{groupError[g.id]}</p>}
        </div>
      ))}

      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Users</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        Same rule — an account only shows up here if it&apos;s been reported, or if you search for it directly.
      </p>
      <input placeholder="Search by name" value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
      {userResult.map((u) => (
        <div key={u.id}>
          <div className="card row between" style={{ marginTop: 10 }}>
            <div>
              <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 2px" }}>{u.name}</p>
              <p className="tiny">joined {new Date(u.memberSince).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link href={`/u/${u.id}`} className="btn">View profile</Link>
              <Button variant="danger" disabled={userBusy === u.id} onClick={() => handleDeleteUser(u.id)}>Delete account</Button>
            </div>
          </div>
          {userError[u.id] && <p className="tiny" style={{ color: "#b5471f", marginTop: 4 }}>{userError[u.id]}</p>}
        </div>
      ))}
    </>
  );
}
