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
  deleteUserAccount,
  dismissReport,
  removeReportedContent,
  reportTargetHref,
  warnReportedUser,
} from "@/lib/data/moderation";
import type { AdminReport, User } from "@/lib/types";

const REASON_LABEL: Record<string, string> = {
  scam: "scam / money request",
  "off-topic": "off-topic",
  inappropriate: "inappropriate content",
  paywalled: "paywalled content",
  copyright: "copyright",
  other: "other",
};

export function AdminDashboardClient({ reports }: { reports: AdminReport[] }) {
  const ready = useRequireAuthPage("/experience", (user) => user.isAdmin);
  const [reportList, setReportList] = useState(reports);
  const [reportError, setReportError] = useState<Record<string, string>>({});
  const [reportBusy, setReportBusy] = useState<string | null>(null);

  const [userQuery, setUserQuery] = useState("");
  const [userResult, setUserResult] = useState<User[]>([]);
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [userError, setUserError] = useState<Record<string, string>>({});

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
