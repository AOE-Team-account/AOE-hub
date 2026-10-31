"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { reasonText } from "@/lib/i18n/reasons";
import type { TParams, UiKey } from "@/lib/i18n/strings";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Translated } from "@/components/ui/Translated";
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

const KIND_KEY: Record<string, UiKey> = { file: "staff.kind.file", post: "staff.kind.post", comment: "staff.kind.comment", user: "staff.kind.user", picture: "staff.kind.picture" };
const TIER_KEY: Record<string, UiKey> = { watcher: "notice.tier.watcher", deacon: "notice.tier.deacon", creator: "notice.tier.creator" };
const TITLE_KEY: Record<string, UiKey> = { file: "staff.itemTitle.file", announcement: "staff.itemTitle.announcement", post: "staff.itemTitle.post", comment: "staff.itemTitle.comment" };
const STATUS_KEY: Record<string, UiKey> = { active: "staff.status.active", suspended: "staff.status.suspended", deleted: "staff.status.deleted" };

export function recordText(t: (key: UiKey, params?: TParams) => string, s: Summary | undefined): string {
  if (!s) return t("staff.record.none");
  const parts = [];
  if (s.red) parts.push(t("staff.record.red", { n: s.red }));
  if (s.yellow) parts.push(t("staff.record.yellow", { n: s.yellow }));
  if (s.green) parts.push(t("staff.record.green", { n: s.green }));
  const base = parts.length ? parts.join(" · ") : t("staff.record.none");
  return s.restricted ? `${base} · ${t("staff.record.restricted")}` : base;
}

// The review list shared by the Watcher/Deacon panel and the Creator's Review
// tab. It only ever shows what the reviewer's own session may read, and every
// button calls a database function that checks the role again on the server.
export function ReviewPanel({ data, isCreator, canSuspend }: { data: ReviewData; isCreator: boolean; canSuspend: boolean }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const [tab, setTab] = useState<"reports" | "browse" | "appeals">("reports");
  const [appealAction, setAppealAction] = useState<{ id: string; decision: "uphold" | "recommend" | "overturn" } | null>(null);
  const [appealNote, setAppealNote] = useState("");
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
      await run(() => supabase.rpc("set_notice", { p_kind: item.kind, p_id: item.id, p_body: text.trim() || null }), t("staff.done.noticeSaved"));
    } else if (type === "warn" && item) {
      await run(() => supabase.rpc("warn_user", { p_kind: item.kind, p_id: item.id, p_reason: reason }), t("staff.done.warned"));
    } else if (type === "delete" && item) {
      await run(() => supabase.rpc("soft_delete_item", { p_kind: item.kind, p_id: item.id, p_reason: reason }), t("staff.done.deleted"));
    } else if (type === "dismiss" && report) {
      await run(() => supabase.rpc("dismiss_report", { p_report_id: report.id, p_reason: reason }), t("staff.done.dismissed"));
    } else if (type === "suspend" && userId) {
      await run(() => supabase.rpc("suspend_account", { p_user_id: userId, p_reason: reason }), t("staff.done.suspended"));
    }
  }

  async function removePicture(r: ReviewReport) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/moderation/remove-picture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: r.targetId, reportId: r.id }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setFlash(d?.error ?? t("creator.didNotWork"));
    setFlash(t("staff.done.pictureRemoved"));
    router.refresh();
  }

  async function decideAppeal() {
    if (!appealAction) return;
    const supabase = createClient();
    const { id, decision } = appealAction;
    const done = decision === "uphold" ? t("staff.done.appealUphold") : decision === "recommend" ? t("staff.done.appealRecommend") : t("staff.done.appealOverturn");
    const ok = await run(() => supabase.rpc("decide_appeal", { p_id: id, p_decision: decision, p_note: appealNote }), done);
    if (ok) { setAppealAction(null); setAppealNote(""); }
  }

  async function removeNotice(item: ReviewItem) {
    const supabase = createClient();
    await run(() => supabase.rpc("remove_notice", { p_kind: item.kind, p_id: item.id }), t("staff.done.noticeRemoved"));
  }

  async function reportToCreator(userId: string) {
    const supabase = createClient();
    await run(() => supabase.rpc("report_to_creator", { p_user_id: userId }), t("staff.done.reportedToCreator"));
  }

  function ItemBody({ item }: { item: ReviewItem }) {
    const summary = data.summaries[item.authorId];
    const locked = item.notice?.tier === "creator" && !isCreator;
    return (
      <>
        <p style={{ fontWeight: 500, margin: "0 0 2px" }}>{item.title || t(TITLE_KEY[item.titleKind])}</p>
        {item.excerpt && (
          <Translated
            type={item.kind === "file" ? "file" : item.kind === "post" ? "experience-post" : "comment"}
            id={item.id}
            field={item.kind === "file" ? "description" : "body"}
            text={item.excerpt}
            className="muted"
            style={{ margin: "0 0 6px" }}
            note
          />
        )}
        <p className="tiny" style={{ margin: "0 0 6px" }}>
          {t("staff.by", { name: item.authorName || t("staff.member") })} · <strong>{recordText(t, summary)}</strong>
          {summary && summary.status !== "active" ? ` · ${STATUS_KEY[summary.status] ? t(STATUS_KEY[summary.status]) : summary.status}` : ""}
        </p>
        {item.notice && (
          <p className="tiny" style={{ margin: "0 0 6px" }}>
            {t("notice.from", { tier: t(TIER_KEY[item.notice.tier] ?? "notice.tier.reviewer") })}{" "}
            <Translated type="notice" id={`${item.kind}:${item.id}`} field="body" text={item.notice.body} as="span" />
            {locked ? ` ${t("staff.lockedNotice")}` : ""}
          </p>
        )}
        {item.mine ? (
          <p className="tiny" style={{ marginTop: 6 }}>{t("staff.yours")}</p>
        ) : (
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
            <Button size="small" disabled={locked} onClick={() => open({ type: "notice", item })}>
              {item.notice ? t("staff.editNotice") : t("staff.addNotice")}
            </Button>
            {item.notice && (
              <Button size="small" disabled={locked || busy} onClick={() => removeNotice(item)}>{t("staff.removeNotice")}</Button>
            )}
            <Button size="small" onClick={() => open({ type: "warn", item })}>{t("staff.warn")}</Button>
            <Button size="small" variant="danger" onClick={() => open({ type: "delete", item })}>{t("common.delete")}</Button>
            {canSuspend && (
              <Button size="small" variant="danger" onClick={() => open({ type: "suspend", userId: item.authorId, userName: item.authorName })}>
                {t("staff.suspendAccount")}
              </Button>
            )}
            {!isCreator && summary && summary.red >= 5 && (
              <Button size="small" disabled={busy} onClick={() => reportToCreator(item.authorId)}>{t("staff.reportToCreator")}</Button>
            )}
          </div>
        )}
      </>
    );
  }

  const list = data.reports;
  const dialogReasons = pending ? reasonsFor(pending.type) : [];
  const title: Record<ActionType, string> = {
    notice: t("staff.title.notice"),
    warn: t("staff.title.warn"),
    delete: t("staff.title.delete"),
    dismiss: t("staff.title.dismiss"),
    suspend: t("staff.title.suspend"),
  };

  return (
    <>
      {flash && (
        <div className="banner-wrap" style={{ margin: "0 0 12px", padding: 0 }}>
          <div className="banner-box">
            <span>{flash}</span>
            <Button size="small" onClick={() => setFlash(null)}>{t("staff.ok")}</Button>
          </div>
        </div>
      )}

      <ChipRow
        options={[
          { value: "reports", label: t("staff.tabReports", { n: list.length }) },
          { value: "browse", label: t("staff.tabBrowse") },
          { value: "appeals", label: t("staff.tabAppeals", { n: data.appeals.length }) },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "reports" && (
        <>
          {list.length === 0 && <p className="muted">{t("staff.noReports")}</p>}
          {list.map((r) => (
            <div className="card" key={r.id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <span className="row" style={{ gap: 6 }}>
                  {r.urgent && <Badge variant="warn">{t("staff.urgent")}</Badge>}
                  {r.takedown && <Badge variant="warn">{t("staff.takedownBadge")}</Badge>}
                  <Badge variant="neutral">{t(KIND_KEY[r.item?.kind ?? (r.targetType === "profile-picture" ? "picture" : "user")])}</Badge>
                  <Badge variant="warn">{reasonText(t, r.reason)}</Badge>
                </span>
                <span className="tiny">{new Date(r.createdAt).toLocaleString(lang)}</span>
              </div>
              {r.takedown && (
                <div className="banner-box" style={{ display: "block", margin: "0 0 8px" }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{t("staff.takedownTitle")}</p>
                  <p className="tiny" style={{ margin: 0 }}>{t("staff.takedownFrom", { name: r.takedown.name, email: r.takedown.email })}</p>
                  {r.takedown.rightsHolder && <p className="tiny" style={{ margin: 0 }}>{t("staff.takedownOwner", { owner: r.takedown.rightsHolder })}</p>}
                  {r.takedown.address && <p className="tiny" style={{ margin: 0 }}>{r.takedown.address}</p>}
                  <p className="tiny" style={{ margin: "4px 0 0" }}>{t("staff.takedownOriginal")} {r.takedown.original}</p>
                  <p className="tiny" style={{ margin: "4px 0 0" }}>{t("staff.takedownSigned", { name: r.takedown.signature })}</p>
                </div>
              )}
              {r.details && !r.takedown && <p className="muted" style={{ marginBottom: 8 }}>“{r.details}”</p>}
              {r.item ? (
                <ItemBody item={r.item} />
              ) : r.targetType === "profile-picture" ? (
                <div>
                  <p className="muted">{t("staff.pictureReport", { name: r.userName || t("staff.member") })}</p>
                  <div className="row" style={{ gap: 10, margin: "6px 0" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/avatar/${r.targetId}?t=${r.id.slice(0, 6)}`} alt="" width={96} height={96} style={{ borderRadius: 10, objectFit: "cover", border: "1px solid var(--border)", background: "var(--bg)" }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <p className="tiny">{t("staff.removePictureHelp")}</p>
                </div>
              ) : r.targetType === "user" ? (
                <p className="muted">{t("staff.reportAboutAccount", { name: r.userName || t("staff.member") })}</p>
              ) : (
                <p className="muted">{t("staff.itemGone")}</p>
              )}
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                {r.item && (
                  <Link href={r.item.href} className="btn small">{t("staff.viewOriginal")}</Link>
                )}
                {r.targetType === "user" && (
                  <Link href={`/u/${r.targetId}`} className="btn small">{t("staff.viewProfile")}</Link>
                )}
                {r.targetType === "profile-picture" && r.targetId !== data.viewerId && (
                  <Button size="small" variant="danger" disabled={busy} onClick={() => removePicture(r)}>{t("staff.removePicture")}</Button>
                )}
                {!(r.item?.mine) && !(r.targetType === "profile-picture" && r.targetId === data.viewerId) && (
                  <Button size="small" onClick={() => open({ type: "dismiss", report: r })}>{t("staff.dismissReport")}</Button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "appeals" && (
        <>
          {data.appeals.length === 0 && <p className="muted">{t("staff.noAppeals")}</p>}
          {data.appeals.map((a) => (
            <div className="card" key={a.id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <span className="row" style={{ gap: 6 }}>
                  <Badge variant="neutral">{t(`staff.appealKind.${a.kind}` as UiKey)}</Badge>
                  {a.status === "recommend-overturn" && <Badge variant="warn">{t("staff.appealRecommended")}</Badge>}
                </span>
                <span className="tiny">{new Date(a.createdAt).toLocaleString(lang)}</span>
              </div>
              <p className="tiny" style={{ margin: "0 0 4px" }}>{t("staff.appealFrom", { name: a.appellant || t("staff.member") })}</p>
              {a.kind === "warning" && (
                <p style={{ margin: "0 0 4px", fontWeight: 500 }}>
                  {a.reasonCode ? reasonText(t, a.reasonCode) : ""}{a.level ? ` — ${t(`staff.level.${a.level}` as UiKey)}` : ""}
                  {a.itemTitle ? <span className="tiny"> · {a.itemTitle}</span> : null}
                </p>
              )}
              {a.kind === "restriction" && a.endsAt && <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{t("staff.appealRestrictionUntil", { date: new Date(a.endsAt).toLocaleDateString(lang) })}</p>}
              <Translated type="appeal" id={a.id} field="message" text={a.message} className="muted" style={{ margin: "0 0 8px" }} note />
              <div className="row wrap" style={{ gap: 6 }}>
                <Button size="small" onClick={() => { setAppealAction({ id: a.id, decision: "uphold" }); setAppealNote(""); setError(null); }}>{t("staff.appealUphold")}</Button>
                {!isCreator && a.kind !== "other" && a.status === "open" && (
                  <Button size="small" onClick={() => { setAppealAction({ id: a.id, decision: "recommend" }); setAppealNote(""); setError(null); }}>{t("staff.appealRecommend")}</Button>
                )}
                {isCreator && a.kind !== "other" && (
                  <Button size="small" variant="danger" onClick={() => { setAppealAction({ id: a.id, decision: "overturn" }); setAppealNote(""); setError(null); }}>{t("staff.appealOverturn")}</Button>
                )}
              </div>
            </div>
          ))}
          <Modal open={appealAction !== null} onClose={() => setAppealAction(null)}>
            {appealAction && (
              <>
                <p role="heading" aria-level={2} className="title">{t(`staff.appealTitle.${appealAction.decision}` as UiKey)}</p>
                <p className="muted">{t("staff.appealNoteHelp")}</p>
                <textarea value={appealNote} onChange={(e) => setAppealNote(e.target.value)} maxLength={500} />
                {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
                <div className="row" style={{ gap: 8 }}>
                  <Button variant={appealAction.decision === "overturn" ? "danger" : "primary"} disabled={busy} onClick={decideAppeal}>{busy ? t("staff.working") : t("staff.confirm")}</Button>
                  <Button onClick={() => setAppealAction(null)}>{t("common.cancel")}</Button>
                </div>
              </>
            )}
          </Modal>
        </>
      )}

      {tab === "browse" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            {t("staff.browseHelp")}
          </p>
          {data.browse.length === 0 && <p className="muted">{t("staff.nothingYet")}</p>}
          {data.browse.map((item) => (
            <div className="card" key={`${item.kind}:${item.id}`}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <Badge variant="neutral">{t(KIND_KEY[item.kind])}</Badge>
                <span className="tiny">{new Date(item.createdAt).toLocaleString(lang)}</span>
              </div>
              <ItemBody item={item} />
              <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                <Link href={item.href} className="btn small">{t("staff.viewOriginal")}</Link>
              </div>
            </div>
          ))}
        </>
      )}

      <Modal open={pending !== null} onClose={close}>
        {pending && (
          <>
            <p role="heading" aria-level={2} className="title">{title[pending.type]}</p>
            {pending.type === "notice" && (
              <>
                <p className="muted">
                  {t("staff.noticeHelp", { tier: t(isCreator ? "notice.tier.creator" : data.kinds.includes("file") ? "notice.tier.watcher" : "notice.tier.deacon") })}
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("staff.noticePlaceholder")}
                  maxLength={500}
                />
              </>
            )}
            {pending.type !== "notice" && (
              <>
                <p className="muted">
                  {pending.type === "warn" && t("staff.help.warn")}
                  {pending.type === "delete" && t("staff.help.delete")}
                  {pending.type === "dismiss" && t("staff.help.dismiss")}
                  {pending.type === "suspend" && t("staff.help.suspend", { name: pending.userName || t("staff.thisAccount") })}
                </p>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="">{t("staff.chooseReason")}</option>
                  {dialogReasons.map((r) => (
                    <option key={r.code} value={r.code}>
                      {reasonText(t, r.code, r.label)}
                      {pending.type === "warn" && r.level ? ` — ${t(`staff.level.${r.level}` as UiKey)}` : ""}
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
                {busy ? t("staff.working") : t("staff.confirm")}
              </Button>
              <Button onClick={close}>{t("common.cancel")}</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
