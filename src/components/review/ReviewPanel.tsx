"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChipRow } from "@/components/ui/ChipRow";
import type { ReviewData, ReviewItem, ReviewReport, Summary } from "@/lib/data/review";

type ActionType = "notice" | "warn" | "delete" | "dismiss" | "suspend";

interface Pending {
  type: ActionType;
  item?: ReviewItem;
  report?: ReviewReport;
  userId?: string;
  userName?: string;
}

const KIND_LABEL: Record<string, string> = { file: "File", post: "Post", comment: "Comment", user: "Account" };
const TIER_LABEL: Record<string, string> = { watcher: "a Watcher", deacon: "a Deacon", creator: "the Creator" };
const REASON_LABEL: Record<string, string> = {
  scam: "Scam or asking for money",
  "off-topic": "Off-topic",
  inappropriate: "Inappropriate content",
  paywalled: "Paywalled or costs money",
  copyright: "Copyright — not their work",
  other: "Something else",
};

export function recordText(s: Summary | undefined): string {
  if (!s) return "no warnings";
  const parts = [];
  if (s.red) parts.push(`${s.red} red`);
  if (s.yellow) parts.push(`${s.yellow} yellow`);
  if (s.green) parts.push(`${s.green} green`);
  const base = parts.length ? parts.join(" · ") : "no warnings";
  return s.restricted ? `${base} · restricted` : base;
}

// The review list shared by the Watcher/Deacon panel and the Creator's Review
// tab. It only ever shows what the reviewer's own session may read, and every
// button calls a database function that checks the role again on the server.
export function ReviewPanel({ data, isCreator, canSuspend }: { data: ReviewData; isCreator: boolean; canSuspend: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"reports" | "browse">("reports");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reasonsFor = (action: string) => data.reasons.filter((r) => r.appliesTo.includes(action));

  function open(p: Pending) {
    setPending(p);
    setReason("");
    setText(p.item?.notice?.body ?? "");
    setError(null);
  }

  function close() {
    setPending(null);
    setError(null);
  }

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    setFlash(done);
    close();
    router.refresh();
    return true;
  }

  async function confirm() {
    if (!pending) return;
    const supabase = createClient();
    const { type, item, report, userId } = pending;
    if (type === "notice" && item) {
      await run(() => supabase.rpc("set_notice", { p_kind: item.kind, p_id: item.id, p_body: text.trim() || null }), "Notice saved.");
    } else if (type === "warn" && item) {
      await run(() => supabase.rpc("warn_user", { p_kind: item.kind, p_id: item.id, p_reason: reason }), "Warning sent privately.");
    } else if (type === "delete" && item) {
      await run(() => supabase.rpc("soft_delete_item", { p_kind: item.kind, p_id: item.id, p_reason: reason }), "Moved to Deleted items. The person was told privately.");
    } else if (type === "dismiss" && report) {
      await run(() => supabase.rpc("dismiss_report", { p_report_id: report.id, p_reason: reason }), "Report dismissed.");
    } else if (type === "suspend" && userId) {
      await run(() => supabase.rpc("suspend_account", { p_user_id: userId, p_reason: reason }), "Account suspended. The Creator has been told.");
    }
  }

  async function removeNotice(item: ReviewItem) {
    const supabase = createClient();
    await run(() => supabase.rpc("remove_notice", { p_kind: item.kind, p_id: item.id }), "Notice removed.");
  }

  async function reportToCreator(userId: string) {
    const supabase = createClient();
    await run(() => supabase.rpc("report_to_creator", { p_user_id: userId }), "Reported to the Creator.");
  }

  function ItemBody({ item }: { item: ReviewItem }) {
    const summary = data.summaries[item.authorId];
    const locked = item.notice?.tier === "creator" && !isCreator;
    return (
      <>
        <p style={{ fontWeight: 500, margin: "0 0 2px" }}>{item.title}</p>
        {item.excerpt && <p className="muted" style={{ margin: "0 0 6px" }}>{item.excerpt}</p>}
        <p className="tiny" style={{ margin: "0 0 6px" }}>
          By {item.authorName} · <strong>{recordText(summary)}</strong>
          {summary && summary.status !== "active" ? ` · ${summary.status}` : ""}
        </p>
        {item.notice && (
          <p className="tiny" style={{ margin: "0 0 6px" }}>
            Notice from {TIER_LABEL[item.notice.tier]}: {item.notice.body}
            {locked ? " (only the Creator can change it)" : ""}
          </p>
        )}
        {item.mine ? (
          <p className="tiny" style={{ marginTop: 6 }}>This one is yours. Another reviewer will handle it.</p>
        ) : (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <Button size="small" disabled={locked} onClick={() => open({ type: "notice", item })}>
              {item.notice ? "Edit notice" : "Add notice"}
            </Button>
            {item.notice && (
              <Button size="small" disabled={locked || busy} onClick={() => removeNotice(item)}>Remove notice</Button>
            )}
            <Button size="small" onClick={() => open({ type: "warn", item })}>Warn</Button>
            <Button size="small" variant="danger" onClick={() => open({ type: "delete", item })}>Delete</Button>
            {canSuspend && (
              <Button size="small" variant="danger" onClick={() => open({ type: "suspend", userId: item.authorId, userName: item.authorName })}>
                Suspend account
              </Button>
            )}
            {!isCreator && summary && summary.red >= 5 && (
              <Button size="small" disabled={busy} onClick={() => reportToCreator(item.authorId)}>Report to the Creator</Button>
            )}
          </div>
        )}
      </>
    );
  }

  const list = data.reports;
  const dialogReasons = pending ? reasonsFor(pending.type) : [];
  const title: Record<ActionType, string> = {
    notice: "Notice above this item",
    warn: "Warn the person",
    delete: "Delete this item",
    dismiss: "Dismiss this report",
    suspend: "Suspend this account",
  };

  return (
    <>
      {flash && (
        <div className="banner-wrap" style={{ margin: "0 0 12px", padding: 0 }}>
          <div className="banner-box">
            <span>{flash}</span>
            <Button size="small" onClick={() => setFlash(null)}>OK</Button>
          </div>
        </div>
      )}

      <ChipRow
        options={[
          { value: "reports", label: `Reports (${list.length})` },
          { value: "browse", label: "Browse the hub" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "reports" && (
        <>
          {list.length === 0 && <p className="muted">No open reports.</p>}
          {list.map((r) => (
            <div className="card" key={r.id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <span className="row" style={{ gap: 6 }}>
                  <Badge variant="neutral">{KIND_LABEL[r.item?.kind ?? "user"]}</Badge>
                  <Badge variant="warn">{REASON_LABEL[r.reason] ?? r.reason}</Badge>
                </span>
                <span className="tiny">{new Date(r.createdAt).toLocaleString()}</span>
              </div>
              {r.details && <p className="muted" style={{ marginBottom: 8 }}>“{r.details}”</p>}
              {r.item ? (
                <ItemBody item={r.item} />
              ) : r.targetType === "user" ? (
                <p className="muted">Report about the account of {r.userName ?? "a member"}.</p>
              ) : (
                <p className="muted">The reported item is no longer visible (it may already be deleted).</p>
              )}
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {r.item && (
                  <Link href={r.item.href} className="btn small">View original ↗</Link>
                )}
                {r.targetType === "user" && (
                  <Link href={`/u/${r.targetId}`} className="btn small">View profile ↗</Link>
                )}
                {!(r.item?.mine) && (
                  <Button size="small" onClick={() => open({ type: "dismiss", report: r })}>Dismiss report</Button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "browse" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            The most recent items across the hub, whether or not anyone reported them.
          </p>
          {data.browse.length === 0 && <p className="muted">Nothing here yet.</p>}
          {data.browse.map((item) => (
            <div className="card" key={`${item.kind}:${item.id}`}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <Badge variant="neutral">{KIND_LABEL[item.kind]}</Badge>
                <span className="tiny">{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <ItemBody item={item} />
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <Link href={item.href} className="btn small">View original ↗</Link>
              </div>
            </div>
          ))}
        </>
      )}

      <Modal open={pending !== null} onClose={close}>
        {pending && (
          <>
            <p className="title">{title[pending.type]}</p>
            {pending.type === "notice" && (
              <>
                <p className="muted">
                  Shown above the item as “Notice from {isCreator ? "the Creator" : data.kinds.includes("file") ? "a Watcher" : "a Deacon"}”.
                  It never names you. Leave it empty for the standard text.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Content below is not fully correct."
                  maxLength={500}
                />
              </>
            )}
            {pending.type !== "notice" && (
              <>
                <p className="muted">
                  {pending.type === "warn" && "The reason sets the level. The person is told privately; nothing is public."}
                  {pending.type === "delete" && "It moves to Deleted items and can be restored by the Creator. The person is told why, privately."}
                  {pending.type === "dismiss" && "The report is closed with no action on the item."}
                  {pending.type === "suspend" &&
                    `Suspending ${pending.userName ?? "this account"} takes effect at once: they can't sign in, post or comment and their content is hidden until the Creator decides.`}
                </p>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">Choose a reason…</option>
                  {dialogReasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                      {pending.type === "warn" && r.level ? ` — ${r.level}` : ""}
                    </option>
                  ))}
                </select>
              </>
            )}
            {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
            <div className="row" style={{ gap: 8 }}>
              <Button
                variant={pending.type === "delete" || pending.type === "suspend" ? "danger" : "primary"}
                disabled={busy || (pending.type !== "notice" && !reason)}
                onClick={confirm}
              >
                {busy ? "Working…" : "Confirm"}
              </Button>
              <Button onClick={close}>Cancel</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
