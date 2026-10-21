"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChipRow } from "@/components/ui/ChipRow";
import { formatBytes } from "@/lib/format";
import { KeyPool } from "./KeyPool";
import { Modal } from "@/components/ui/Modal";
import { BackLink } from "@/components/ui/BackLink";
import { ReviewPanel } from "@/components/review/ReviewPanel";
import { RulesButton } from "@/components/review/RulesModal";
import type { ReviewData } from "@/lib/data/review";
import { KeyHelpEditor, type KeyHelpRow } from "./KeyHelpEditor";
import { KnowledgePanel } from "./KnowledgePanel";

export interface CreatorData {
  review: ReviewData;
  holders: { user_id: string; role: string }[];
  accounts: {
    user_id: string; name: string; email: string; account_status: string; status_reason: string | null;
    status_changed_at: string | null; record: string; referral_id: string | null; referral_at: string | null;
  }[];
  trash: {
    kind: string; id: string; title: string; author_id: string; deleted_at: string; deleted_by: string | null;
    deleted_reason: string | null;
  }[];
  log: {
    id: number; created_at: string; actor_id: string | null; actor_role: string | null; action: string;
    target_kind: string | null; target_id: string | null; subject_user_id: string | null; reason_code: string | null;
    details: Record<string, unknown>; undoes: number | null;
  }[];
  names: Record<string, string>;
  keyHelp: KeyHelpRow[];
  uploads: { files: number; bytes: number };
  linkHosts: { host: string; name: string }[];
  linkRequests: { id: string; user_id: string; host: string; note: string | null; created_at: string }[];
  security: { requireTwoStepForStaff: boolean; events: { at: string; kind: string }[]; keysLeft: number };
}

type Tab = "review" | "people" | "accounts" | "trash" | "log" | "ai" | "hub";

const ROLES: { code: "watcher" | "deacon" | "answerer" | "verified"; label: string; help: string }[] = [
  { code: "watcher", label: "Watcher", help: "Sees every post, comment, file and report; can add a notice, warn, delete or dismiss." },
  { code: "deacon", label: "Deacon", help: "Same as a Watcher, but posts and comments only, never files." },
  { code: "answerer", label: "Answerer", help: "Posts, files and comments are pinned to the top. Shows an A badge." },
  { code: "verified", label: "Verified", help: "You agree with their ideas. Shows a V badge; comments are highlighted." },
];

const ACTION_TEXT: Record<string, string> = {
  delete: "Deleted a {kind}",
  warn: "Warned about a {kind}",
  "notice-set": "Added or edited a notice on a {kind}",
  "notice-removed": "Removed the notice from a {kind}",
  "dismiss-report": "Dismissed a report",
  undo: "Undid a change",
  "role-granted": "Gave a role",
  "role-revoked": "Removed a role",
  suspend: "Suspended an account",
  restrict: "Restricted an account for a week",
  "delete-account": "Deleted an account",
  "restore-account": "Restored an account",
  "report-to-creator": "Reported an account to the Creator",
  "dismiss-referral": "Dismissed a report about an account",
  purge: "Erased expired items for good",
  "two-step-requested": "Asked a member to turn on two-step sign-in",
  "recovery-key-used": "A recovery key was used",
  "setting-changed": "Changed a hub setting",
};
const KIND_WORD: Record<string, string> = { file: "file", post: "post", comment: "comment", user: "account", report: "report" };
const UNDOABLE = new Set(["delete", "warn", "notice-set", "notice-removed", "dismiss-report", "suspend", "restrict", "delete-account"]);

interface Person {
  id: string; name: string; display_name: string | null; email: string; account_status: string; roles: string[]; record: string;
  has_two_step: boolean;
}

const EVENT_TEXT: Record<string, string> = {
  "code-created": "Access code created",
  "code-changed": "Access code changed",
  "code-ok": "Panel opened with the access code",
  "code-wrong": "Wrong access code",
  "key-wrong": "Wrong recovery key",
  "recovery-used": "A recovery key was used",
  "keys-created": "New recovery keys created",
  "two-step-requested": "Asked a member to turn on two-step sign-in",
};

export function CreatorClient({ data }: { data: CreatorData }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("review");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[] | null>(null);
  const [selected, setSelected] = useState<Person | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; danger?: boolean; reasonFor?: string; go: (reason: string) => PromiseLike<{ error: { message: string } | null }>; done: string }>(null);
  const [reason, setReason] = useState("");
  const [newKeys, setNewKeys] = useState<string[] | null>(null);
  const [curCode, setCurCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const GB = 1024 * 1024 * 1024;
  const [upFiles, setUpFiles] = useState(String(data.uploads.files));
  const [upGb, setUpGb] = useState(String(Math.round((data.uploads.bytes / GB) * 100) / 100));
  const [limitFor, setLimitFor] = useState<null | { person: Person; usedFiles: number; usedBytes: number; limitFiles: number | null; limitBytes: number | null; files: string; gb: string }>(null);
  const [newHost, setNewHost] = useState("");
  const [newHostName, setNewHostName] = useState("");
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  const supabase = createClient();
  const nameOf = (id: string | null) => (id ? data.names[id] ?? "a member" : "the system");

  async function perform(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(
        /Unlock the Creator panel|Only the Creator/i.test(err.message)
          ? "Your Creator session has timed out for safety. Open the panel again to continue."
          : err.message
      );
      if (/Unlock the Creator panel|Only the Creator/i.test(err.message)) router.push("/creator/unlock");
      return false;
    }
    setFlash(done);
    setConfirm(null);
    router.refresh();
    return true;
  }

  async function search() {
    setError(null);
    const { data: rows, error: err } = await supabase.rpc("find_people", { p_query: query });
    if (err) return setError(err.message);
    setResults((rows ?? []) as Person[]);
    setSelected(null);
  }

  function toggleRole(person: Person, role: (typeof ROLES)[number], on: boolean) {
    setReason("");
    setConfirm({
      title: on ? `Give ${role.label}?` : `Remove ${role.label}?`,
      body: on
        ? `You are changing roles for ${person.name} (${person.email}). They will be told ${role.code === "watcher" || role.code === "deacon" ? "and a button to their panel appears on their profile" : "and a badge appears next to their name"}. ${role.help}`
        : `Remove ${person.name}'s ${role.label} role? It stops working at once. They keep their ordinary account and you can give it back any time.`,
      go: () => supabase.rpc(on ? "grant_role" : "revoke_role", { p_user_id: person.id, p_role: role.code }),
      done: on ? `${role.label} given to ${person.name}.` : `${role.label} removed from ${person.name}.`,
    });
  }

  async function downloadRecord(userId: string, name: string) {
    const { data: evidence, error: err } = await supabase.rpc("person_evidence", { p_user_id: userId });
    if (err) return setError(err.message);
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `record-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const undone = new Set(data.log.filter((l) => l.undoes != null).map((l) => l.undoes as number));
  const holderGroups = new Map<string, string[]>();
  data.holders.forEach((h) => holderGroups.set(h.user_id, [...(holderGroups.get(h.user_id) ?? []), h.role]));
  const warnReasons = data.review.reasons.filter((r) => r.appliesTo.includes("warn"));

  return (
    <>
      <BackLink href="/profile" label="Back to my profile" />
      <p className="title" style={{ margin: "0 0 2px" }}>Creator panel</p>
      <p className="tiny" style={{ marginBottom: 6 }}>Private to you. Nobody else can see that this panel exists, or who holds it.</p>
      <p className="tiny" style={{ marginBottom: 12 }}>The Creator can&apos;t post. To share something, use your ordinary account.</p>

      <ChipRow
        options={[
          { value: "review", label: "Review" },
          { value: "people", label: "People & roles" },
          { value: "accounts", label: `Accounts${data.accounts.length ? ` (${data.accounts.length})` : ""}` },
          { value: "trash", label: "Deleted items" },
          { value: "log", label: "Activity log" },
          { value: "ai", label: "AI & books" },
          { value: "hub", label: "Hub" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {flash && (
        <div className="banner-wrap" style={{ margin: "0 0 12px", padding: 0 }}>
          <div className="banner-box"><span>{flash}</span><Button size="small" onClick={() => setFlash(null)}>OK</Button></div>
        </div>
      )}
      {error && <p className="muted" style={{ color: "#b5471f", marginBottom: 10 }}>{error}</p>}

      {tab === "review" && <ReviewPanel data={data.review} isCreator canSuspend />}

      {tab === "people" && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "0 0 4px" }}>Find a person</p>
          <p className="tiny" style={{ marginBottom: 8 }}>Search by name or email. Nobody is listed until you search, so nothing changes by accident.</p>
          <div className="row" style={{ gap: 8 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search by name or email" autoComplete="off" />
            <Button onClick={search}>Search</Button>
          </div>
          {results && results.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No one matches.</p>}
          {results?.map((p) => (
            <div className="card" key={p.id} style={{ marginTop: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 500, margin: 0 }}>{p.name}</p>
                  <p className="tiny" style={{ margin: 0 }}>{p.email} · {p.account_status} · {p.record}</p>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Button size="small" onClick={() => setSelected(p)}>Change roles</Button>
                  <Button size="small" disabled={busy} onClick={async () => {
                    setError(null);
                    const { data: r, error: e } = await supabase.rpc("member_upload_limit", { p_user_id: p.id });
                    if (e) return setError(e.message);
                    const x = r as { override_files: number | null; override_bytes: number | null; limit_files: number | null; limit_bytes: number | null; used_files: number; used_bytes: number };
                    setLimitFor({
                      person: p, usedFiles: x.used_files, usedBytes: x.used_bytes, limitFiles: x.limit_files, limitBytes: x.limit_bytes,
                      files: x.override_files == null ? "" : String(x.override_files),
                      gb: x.override_bytes == null ? "" : String(Math.round((x.override_bytes / GB) * 100) / 100),
                    });
                  }}>Upload limit</Button>
                </div>
              </div>
              {selected?.id === p.id && (
                <div style={{ marginTop: 12 }}>
                  <p className="tiny" style={{ marginBottom: 8 }}>You are changing roles for: <strong>{p.name}, {p.email}</strong></p>
                  {ROLES.map((r) => {
                    const has = p.roles.includes(r.code);
                    const needsTwoStep = !has && (r.code === "watcher" || r.code === "deacon") && data.security.requireTwoStepForStaff && !p.has_two_step;
                    return (
                      <label key={r.code} className="check-item" style={{ alignItems: "flex-start" }}>
                        <input type="checkbox" checked={has} disabled={needsTwoStep} style={{ width: "auto", marginTop: 3 }} onChange={() => toggleRole(p, r, !has)} />
                        <span>
                          <strong>{r.label}</strong> — {r.help}
                          {needsTwoStep && <span className="tiny"> (They need to turn on two-step sign-in in Settings first.)</span>}
                        </span>
                        {needsTwoStep && (
                          <Button size="small" disabled={busy} onClick={(e) => {
                            e.preventDefault();
                            perform(() => supabase.rpc("ask_for_two_step", { p_user_id: p.id }), `${p.name} was asked to turn on two-step sign-in.`);
                          }}>Ask them</Button>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {limitFor && (
            <div className="card" style={{ marginTop: 10 }}>
              <p className="title" style={{ marginBottom: 4 }}>Upload limit for {limitFor.person.name}</p>
              <p className="tiny" style={{ marginBottom: 8 }}>
                {limitFor.limitFiles === null ? "No limit (Creator account)." : `Now: ${limitFor.limitFiles.toLocaleString()} files and ${formatBytes(limitFor.limitBytes ?? 0)} a day.`}{" "}
                Used today: {limitFor.usedFiles.toLocaleString()} files, {formatBytes(limitFor.usedBytes)}. Leave a box empty to use the hub&apos;s normal limit for it.
              </p>
              <div className="row wrap" style={{ gap: 8 }}>
                <input style={{ width: 150 }} inputMode="numeric" placeholder="Files per day" value={limitFor.files} onChange={(e) => setLimitFor({ ...limitFor, files: e.target.value.replace(/[^0-9]/g, "") })} />
                <input style={{ width: 150 }} inputMode="decimal" placeholder="GB per day" value={limitFor.gb} onChange={(e) => setLimitFor({ ...limitFor, gb: e.target.value.replace(/[^0-9.]/g, "") })} />
                <Button variant="primary" size="small" disabled={busy} onClick={async () => {
                  const ok = await perform(() => supabase.rpc("set_member_upload_limit", {
                    p_user_id: limitFor.person.id,
                    p_files: limitFor.files === "" ? null : Number(limitFor.files),
                    p_bytes: limitFor.gb === "" ? null : Math.round(Number(limitFor.gb) * GB),
                  }), "Upload limit saved.");
                  if (ok) setLimitFor(null);
                }}>Save</Button>
                <Button size="small" disabled={busy} onClick={async () => {
                  const ok = await perform(() => supabase.rpc("set_member_upload_limit", { p_user_id: limitFor.person.id, p_files: null, p_bytes: null }), "Back to the hub's normal limit.");
                  if (ok) setLimitFor(null);
                }}>Use the normal limit</Button>
                <Button size="small" onClick={() => setLimitFor(null)}>Close</Button>
              </div>
            </div>
          )}

          <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Who has a role right now</p>
          {holderGroups.size === 0 && <p className="muted">No one holds a role yet.</p>}
          {[...holderGroups.entries()].map(([userId, roles]) => (
            <div className="card" key={userId}>
              <p style={{ fontWeight: 500, margin: "0 0 6px" }}>{nameOf(userId)}</p>
              <div className="row wrap" style={{ gap: 6 }}>
                {roles.sort().map((role) => {
                  const def = ROLES.find((r) => r.code === role);
                  return (
                    <Button
                      key={role}
                      size="small"
                      onClick={() => {
                        setReason("");
                        setConfirm({
                          title: `Remove ${def?.label ?? role}?`,
                          body: `Remove ${nameOf(userId)}'s ${def?.label ?? role} role? It stops working at once. They keep their ordinary account and you can give it back any time.`,
                          go: () => supabase.rpc("revoke_role", { p_user_id: userId, p_role: role }),
                          done: `${def?.label ?? role} removed.`,
                        });
                      }}
                    >
                      Remove {def?.label ?? role}
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "accounts" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            Suspended accounts waiting for your decision, accounts reported at 5 red warnings, and accounts that were deleted (they can be restored for 30 days, then they are erased for good).
          </p>
          {data.accounts.length === 0 && <p className="muted">Nothing needs a decision.</p>}
          {data.accounts.map((a) => (
            <div className="card" key={a.user_id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <p style={{ fontWeight: 500, margin: 0 }}>{a.name} <span className="tiny">({a.email})</span></p>
                <span className="row" style={{ gap: 6 }}>
                  {a.account_status !== "active" && <Badge variant="warn">{a.account_status}</Badge>}
                  {a.referral_id && <Badge variant="warn">reported at 5 red</Badge>}
                </span>
              </div>
              <p className="tiny" style={{ margin: "0 0 6px" }}>
                Record: <strong>{a.record}</strong>
                {a.status_reason ? ` · reason: ${a.status_reason}` : ""}
                {a.status_changed_at ? ` · since ${new Date(a.status_changed_at).toLocaleString()}` : ""}
              </p>
              <div className="row wrap" style={{ gap: 6 }}>
                <Button size="small" onClick={() => downloadRecord(a.user_id, a.name)}>Download record</Button>
                {a.account_status === "suspended" && (
                  <>
                    <Button size="small" variant="primary" onClick={() => setConfirm({
                      title: "Lift the suspension?", body: `${a.name} can sign in and post again.`,
                      go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "active" }), done: "Suspension lifted.",
                    })}>Lift suspension</Button>
                    <Button size="small" onClick={() => { setReason(""); setConfirm({
                      title: "Apply a one-week restriction", body: `${a.name} can read and download but not post, upload or comment for a week. Choose the reason; it is recorded.`,
                      reasonFor: "warn",
                      go: (r) => supabase.rpc("restrict_account", { p_user_id: a.user_id, p_reason: r }), done: "Restriction applied.",
                    }); }}>Apply a one-week restriction</Button>
                  </>
                )}
                {a.account_status === "deleted" ? (
                  <Button size="small" variant="primary" onClick={() => setConfirm({
                    title: "Restore this account?", body: `${a.name} gets their account, posts and files back.`,
                    go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "active" }), done: "Account restored.",
                  })}>Restore</Button>
                ) : a.referral_id ? (
                  <>
                    <Button size="small" variant="danger" onClick={() => setConfirm({
                      title: "Delete this account?", danger: true,
                      body: `${a.name} is signed out and their content hidden at once. After 30 days it is erased for good; until then you can restore it. Their record is kept.`,
                      go: () => supabase.rpc("decide_referral", { p_referral_id: a.referral_id, p_decision: "delete" }), done: "Account deleted.",
                    })}>Delete account</Button>
                    <Button size="small" onClick={() => setConfirm({
                      title: "Dismiss this report?", body: "Nothing happens to the account.",
                      go: () => supabase.rpc("decide_referral", { p_referral_id: a.referral_id, p_decision: "dismiss" }), done: "Report dismissed.",
                    })}>Dismiss report</Button>
                  </>
                ) : (
                  <Button size="small" variant="danger" onClick={() => setConfirm({
                    title: "Delete this account?", danger: true,
                    body: `${a.name} is signed out and their content hidden at once. After 30 days it is erased for good; until then you can restore it.`,
                    go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "deleted", p_reason: "reviewed by the Creator" }), done: "Account deleted.",
                  })}>Delete account</Button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "trash" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            Everything a Watcher, a Deacon or you deleted. Restore puts it back exactly where it was. Items are erased for good 30 days after deletion.
          </p>
          {data.trash.length === 0 && <p className="muted">Nothing in the trash.</p>}
          {data.trash.map((t) => (
            <div className="card" key={`${t.kind}:${t.id}`}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 500, margin: 0 }}>{t.title || "(untitled)"} <Badge variant="neutral">{t.kind}</Badge></p>
                  <p className="tiny" style={{ margin: 0 }}>
                    By {nameOf(t.author_id)} · deleted {new Date(t.deleted_at).toLocaleString()} by {nameOf(t.deleted_by)}
                    {t.deleted_reason ? ` · reason: ${t.deleted_reason}` : ""}
                  </p>
                </div>
                <Button size="small" variant="primary" disabled={busy} onClick={() => perform(() => supabase.rpc("restore_item", { p_kind: t.kind, p_id: t.id }), "Restored.")}>Restore</Button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "log" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            Everything the Creator, a Watcher or a Deacon did: what, when and who. Only you can see this. Undo puts a change back, newest first per item.
          </p>
          {data.log.length === 0 && <p className="muted">Nothing has been recorded yet.</p>}
          {data.log.map((l) => {
            const text = (ACTION_TEXT[l.action] ?? l.action).replace("{kind}", KIND_WORD[l.target_kind ?? ""] ?? "item");
            const wasUndone = undone.has(l.id);
            const reasonLabel = (l.details?.reason_label as string | undefined) ?? undefined;
            const role = (l.details?.role as string | undefined) ?? undefined;
            return (
              <div className="card" key={l.id} style={{ opacity: wasUndone ? 0.6 : 1 }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div>
                    <p style={{ margin: 0 }}>
                      <strong>{text}</strong>
                      {l.subject_user_id ? ` — ${nameOf(l.subject_user_id)}` : ""}
                      {role ? ` (${role})` : ""}
                    </p>
                    <p className="tiny" style={{ margin: 0 }}>
                      {new Date(l.created_at).toLocaleString()} · by {nameOf(l.actor_id)}{l.actor_role ? ` (${l.actor_role})` : ""}
                      {reasonLabel ? ` · ${reasonLabel}` : ""}
                      {wasUndone ? " · Undone by Creator" : ""}
                    </p>
                  </div>
                  {UNDOABLE.has(l.action) && l.undoes == null && !wasUndone && (
                    <Button size="small" disabled={busy} onClick={() => perform(() => supabase.rpc("undo_activity", { p_log_id: l.id }), "Undone.")}>Undo</Button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {tab === "ai" && (
        <>
          <KeyPool />
          <KnowledgePanel />
        </>
      )}

      {tab === "hub" && (
        <>
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Hub announcement</p>
            <p className="muted" style={{ marginBottom: 10 }}>Pins a message to the top of the Experience Board. It appears as coming from AOEhub, not from a person.</p>
            <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Title" maxLength={200} />
            <textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Message" style={{ marginTop: 8 }} />
            <Button variant="primary" style={{ marginTop: 8 }} disabled={busy || !annTitle.trim() || !annBody.trim()}
              onClick={async () => {
                const ok = await perform(() => supabase.rpc("post_announcement", { p_title: annTitle, p_body: annBody }), "Announcement posted.");
                if (ok) { setAnnTitle(""); setAnnBody(""); }
              }}>
              Post announcement
            </Button>
          </div>
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Daily upload limit</p>
            <p className="muted" style={{ marginBottom: 10 }}>
              How much one member may upload each day (the day starts at midnight UTC). Change it up or down any time; it takes effect at once.
              Your own account is never limited. To give one member more or less, use <strong>People &amp; roles → Find a person → Upload limit</strong>.
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <input style={{ width: 150 }} inputMode="numeric" value={upFiles} onChange={(e) => setUpFiles(e.target.value.replace(/[^0-9]/g, ""))} aria-label="Files per member per day" />
              <span className="tiny">files and</span>
              <input style={{ width: 150 }} inputMode="decimal" value={upGb} onChange={(e) => setUpGb(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Gigabytes per member per day" />
              <span className="tiny">GB per member per day</span>
              <Button variant="primary" size="small" disabled={busy || upFiles === "" || upGb === "" || isNaN(Number(upGb))} onClick={async () => {
                const ok1 = await perform(() => supabase.rpc("set_hub_setting", { p_key: "upload_daily_files", p_value: Number(upFiles) }), "Upload limit saved.");
                if (ok1) await perform(() => supabase.rpc("set_hub_setting", { p_key: "upload_daily_bytes", p_value: Math.round(Number(upGb) * GB) }), "Upload limit saved.");
              }}>Save</Button>
            </div>
          </div>
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Websites members may link to</p>
            <p className="muted" style={{ marginBottom: 10 }}>
              A link-out (for a file too big to upload) may only point to these websites, or to a page on them. Each one is labelled
              &ldquo;Hosted outside AOEhub&rdquo; and is not scanned by the hub.
            </p>
            {data.linkHosts.map((h) => (
              <div className="row between wrap" key={h.host} style={{ gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                <span><strong>{h.name}</strong> <span className="tiny">· {h.host}</span></span>
                <Button size="small" disabled={busy} onClick={() => { if (window.confirm(`Stop allowing links to ${h.host}? Links already posted stay as they are.`)) perform(() => supabase.rpc("remove_link_host", { p_host: h.host }), `${h.host} removed.`); }}>Remove</Button>
              </div>
            ))}
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <input style={{ width: 200 }} value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder="Website, e.g. itch.io" />
              <input style={{ width: 160 }} value={newHostName} onChange={(e) => setNewHostName(e.target.value)} placeholder="Name to show" />
              <Button variant="primary" size="small" disabled={busy || !newHost.trim()} onClick={async () => {
                const ok = await perform(() => supabase.rpc("add_link_host", { p_host: newHost, p_name: newHostName }), "Website added.");
                if (ok) { setNewHost(""); setNewHostName(""); }
              }}>Allow this website</Button>
            </div>
            {data.linkRequests.length > 0 && (
              <>
                <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>Requests from members</p>
                {data.linkRequests.map((r) => (
                  <div className="row between wrap" key={r.id} style={{ gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                    <span><strong>{r.host}</strong>{r.note ? <span className="tiny"> · {r.note}</span> : null} <span className="tiny">· from {nameOf(r.user_id)}</span></span>
                    <span className="row" style={{ gap: 6 }}>
                      <Button size="small" variant="primary" disabled={busy} onClick={() => perform(() => supabase.rpc("resolve_link_host_request", { p_id: r.id, p_approve: true }), "Approved. The member was told.")}>Allow</Button>
                      <Button size="small" disabled={busy} onClick={() => perform(() => supabase.rpc("resolve_link_host_request", { p_id: r.id, p_approve: false }), "Dismissed. The member was told.")}>Not now</Button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          <KeyHelpEditor rows={data.keyHelp} />
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Rules for reviewers</p>
            <p className="muted" style={{ marginBottom: 10 }}>The strict rules every Watcher and Deacon follows.</p>
            <RulesButton />
          </div>
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Signing in safely</p>
            <p className="muted" style={{ marginBottom: 8 }}>
              Recovery keys get you back in if you lose your authenticator app or forget the access code. Each works once.
              You have <strong>{data.security.keysLeft}</strong> left.
            </p>
            {newKeys && (
              <>
                <pre style={{ background: "var(--bg)", padding: 10, borderRadius: 8, overflowX: "auto" }}>{newKeys.join("\n")}</pre>
                <p className="tiny" style={{ marginBottom: 8 }}>Shown only now. Save them offline, not on the device you sign in from.</p>
              </>
            )}
            <div className="row wrap" style={{ gap: 8 }}>
              <Button size="small" disabled={busy} onClick={async () => {
                setBusy(true);
                const { data: k, error: e } = await supabase.rpc("create_recovery_keys");
                setBusy(false);
                if (e) return setError(e.message);
                setNewKeys(k as string[]);
                router.refresh();
              }}>Create new recovery keys</Button>
              <Button size="small" disabled={busy} onClick={async () => {
                await supabase.rpc("lock_creator_panel");
                router.replace("/creator/unlock");
              }}>Lock the panel now</Button>
            </div>
            <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>Change the access code</p>
            <input type="password" value={curCode} onChange={(e) => setCurCode(e.target.value)} placeholder="Current code" autoComplete="off" />
            <input type="password" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="New code (at least 10 characters)" autoComplete="new-password" style={{ marginTop: 8 }} />
            <Button size="small" style={{ marginTop: 8 }} disabled={busy || newCode.length < 10} onClick={async () => {
              setBusy(true);
              const { data: r, error: e } = await supabase.rpc("set_creator_code", { p_new: newCode, p_current: curCode || null });
              setBusy(false);
              if (e) return setError(e.message);
              if (!(r as { ok: boolean }).ok) return setError((r as { error?: string }).error ?? "Could not change the code.");
              setCurCode(""); setNewCode(""); setFlash("Access code changed.");
            }}>Change the code</Button>
            <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>Recent sign-in events</p>
            {data.security.events.length === 0 && <p className="tiny">Nothing yet.</p>}
            {data.security.events.map((e, i) => (
              <p className="tiny" key={i} style={{ margin: "0 0 2px" }}>{new Date(e.at).toLocaleString()} · {EVENT_TEXT[e.kind] ?? e.kind}</p>
            ))}
          </div>
          <div className="card">
            <p className="title" style={{ marginBottom: 4 }}>Two-step sign-in for Watchers and Deacons</p>
            <p className="muted" style={{ marginBottom: 8 }}>
              When on, a person must turn on two-step sign-in before they can be made a Watcher or Deacon, and their panel only opens for a session that passed it.
            </p>
            <label className="check-item">
              <input type="checkbox" style={{ width: "auto" }} checked={data.security.requireTwoStepForStaff} disabled={busy}
                onChange={(e) => perform(() => supabase.rpc("set_hub_setting", { p_key: "require_2fa_staff", p_value: e.target.checked }), "Setting saved.")} />
              <span>Require two-step sign-in for Watchers and Deacons</span>
            </label>
          </div>
        </>
      )}

      <Modal open={confirm !== null} onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <p className="title">{confirm.title}</p>
            <p className="muted">{confirm.body}</p>
            {confirm.reasonFor && (
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Choose a reason…</option>
                {warnReasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
              </select>
            )}
            {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
            <div className="row" style={{ gap: 8 }}>
              <Button variant={confirm.danger ? "danger" : "primary"} disabled={busy || (!!confirm.reasonFor && !reason)} onClick={() => perform(() => confirm.go(reason), confirm.done)}>
                {busy ? "Working…" : "Confirm"}
              </Button>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
