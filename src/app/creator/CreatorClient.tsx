"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ChipRow } from "@/components/ui/ChipRow";
import { formatBytes } from "@/lib/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import { reasonText } from "@/lib/i18n/reasons";
import type { UiKey } from "@/lib/i18n/strings";
import { KeyPool } from "./KeyPool";
import { StorageCard } from "./StorageCard";
import { StorageBanner } from "./StorageBanner";
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
  uploads: { files: number; bytes: number; maxFile: number };
  linkHosts: { host: string; name: string }[];
  linkRequests: { id: string; user_id: string; host: string; note: string | null; created_at: string }[];
  security: { requireTwoStepForStaff: boolean; events: { at: string; kind: string }[]; keysLeft: number };
}

type Tab = "review" | "people" | "accounts" | "trash" | "log" | "ai" | "hub";

const ROLES: { code: "watcher" | "deacon" | "answerer" | "verified"; label: string; help: UiKey }[] = [
  { code: "watcher", label: "Watcher", help: "creator.role.watcher" },
  { code: "deacon", label: "Deacon", help: "creator.role.deacon" },
  { code: "answerer", label: "Answerer", help: "creator.role.answerer" },
  { code: "verified", label: "Verified", help: "creator.role.verified" },
];

const ACTION_KEY: Record<string, UiKey> = {
  delete: "creator.action.delete",
  warn: "creator.action.warn",
  "notice-set": "creator.action.noticeSet",
  "notice-removed": "creator.action.noticeRemoved",
  "dismiss-report": "creator.action.dismissReport",
  undo: "creator.action.undo",
  "role-granted": "creator.action.roleGranted",
  "role-revoked": "creator.action.roleRevoked",
  suspend: "creator.action.suspend",
  restrict: "creator.action.restrict",
  "delete-account": "creator.action.deleteAccount",
  "restore-account": "creator.action.restoreAccount",
  "report-to-creator": "creator.action.reportToCreator",
  "dismiss-referral": "creator.action.dismissReferral",
  purge: "creator.action.purge",
  "two-step-requested": "creator.action.twoStepRequested",
  "recovery-key-used": "creator.action.recoveryKeyUsed",
  "setting-changed": "creator.action.settingChanged",
  "appeal-decided": "creator.action.appealDecided",
  "picture-removed": "creator.action.pictureRemoved",
};
const KIND_KEY: Record<string, UiKey> = { file: "creator.kindWord.file", post: "creator.kindWord.post", comment: "creator.kindWord.comment", user: "creator.kindWord.user", report: "creator.kindWord.report" };
const UNDOABLE = new Set(["delete", "warn", "notice-set", "notice-removed", "dismiss-report", "suspend", "restrict", "delete-account"]);

interface Person {
  id: string; name: string; display_name: string | null; email: string; account_status: string; roles: string[]; record: string;
  has_two_step: boolean;
}

const EVENT_KEY: Record<string, UiKey> = {
  "code-created": "creator.event.codeCreated",
  "code-changed": "creator.event.codeChanged",
  "code-ok": "creator.event.codeOk",
  "code-wrong": "creator.event.codeWrong",
  "key-wrong": "creator.event.keyWrong",
  "recovery-used": "creator.event.recoveryUsed",
  "keys-created": "creator.event.keysCreated",
  "two-step-requested": "creator.event.twoStepRequested",
};
const STATUS_KEY: Record<string, UiKey> = { active: "staff.status.active", suspended: "staff.status.suspended", deleted: "staff.status.deleted" };

export function CreatorClient({ data }: { data: CreatorData }) {
  const router = useRouter();
  const { t, lang } = useLanguage();
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
  const [upMaxGb, setUpMaxGb] = useState(String(Math.round((data.uploads.maxFile / GB) * 100) / 100));
  const [limitFor, setLimitFor] = useState<null | { person: Person; usedFiles: number; usedBytes: number; limitFiles: number | null; limitBytes: number | null; files: string; gb: string; once: number | null; onceGb: string }>(null);
  const [newHost, setNewHost] = useState("");
  const [newHostName, setNewHostName] = useState("");
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");

  const supabase = createClient();
  const nameOf = (id: string | null) => (id ? data.names[id] ?? t("staff.member") : t("creator.theSystem"));
  const when = (iso: string) => new Date(iso).toLocaleString(lang);

  async function perform(fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(
        /Unlock the Creator panel|Only the Creator/i.test(err.message)
          ? t("creator.timedOut")
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
      title: on ? t("creator.give", { role: role.label }) : t("creator.takeAway", { role: role.label }),
      body: on
        ? t("creator.giveBody", {
            name: person.name,
            email: person.email,
            how: role.code === "watcher" || role.code === "deacon" ? t("creator.howPanel") : t("creator.howBadge"),
            help: t(role.help),
          })
        : t("creator.removeBody", { name: person.name, role: role.label }),
      go: () => supabase.rpc(on ? "grant_role" : "revoke_role", { p_user_id: person.id, p_role: role.code }),
      done: on ? t("creator.given", { role: role.label, name: person.name }) : t("creator.removedFrom", { role: role.label, name: person.name }),
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
      <BackLink href="/profile" label={t("staff.backToProfile")} />
      <div className="row between wrap" style={{ gap: 8, margin: "0 0 2px" }}>
        <p role="heading" aria-level={2} className="title" style={{ margin: 0 }}>{t("creator.panelTitle")}</p>
        <LanguageSelect style={{ width: "auto", padding: "6px 10px", fontSize: 13 }} />
      </div>
      <p className="tiny" style={{ marginBottom: 6 }}>{t("creator.private")}</p>
      <p className="tiny" style={{ marginBottom: 12 }}>{t("creator.cantPost")}</p>
      <StorageBanner />

      <ChipRow
        options={[
          { value: "review", label: t("creator.tab.review") },
          { value: "people", label: t("creator.tab.people") },
          { value: "accounts", label: `${t("creator.tab.accounts")}${data.accounts.length ? ` (${data.accounts.length})` : ""}` },
          { value: "trash", label: t("creator.tab.trash") },
          { value: "log", label: t("creator.tab.log") },
          { value: "ai", label: t("creator.tab.ai") },
          { value: "hub", label: t("creator.tab.hub") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {flash && (
        <div className="banner-wrap" style={{ margin: "0 0 12px", padding: 0 }}>
          <div className="banner-box"><span>{flash}</span><Button size="small" onClick={() => setFlash(null)}>{t("staff.ok")}</Button></div>
        </div>
      )}
      {error && <p className="muted" style={{ color: "#b5471f", marginBottom: 10 }}>{error}</p>}

      {tab === "review" && <ReviewPanel data={data.review} isCreator canSuspend />}

      {tab === "people" && (
        <>
          <p className="label" style={{ fontWeight: 500, margin: "0 0 4px" }}>{t("creator.people.find")}</p>
          <p className="tiny" style={{ marginBottom: 8 }}>{t("creator.people.findHelp")}</p>
          <div className="row" style={{ gap: 8 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder={t("creator.people.searchPh")} autoComplete="off" />
            <Button onClick={search}>{t("creator.people.search")}</Button>
          </div>
          {results && results.length === 0 && <p className="muted" style={{ marginTop: 10 }}>{t("creator.people.noMatch")}</p>}
          {results?.map((p) => (
            <div className="card" key={p.id} style={{ marginTop: 10 }}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 500, margin: 0 }}>{p.name}</p>
                  <p className="tiny" style={{ margin: 0 }}>{p.email} · {STATUS_KEY[p.account_status] ? t(STATUS_KEY[p.account_status]) : p.account_status} · {p.record}</p>
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <Button size="small" onClick={() => setSelected(p)}>{t("creator.people.changeRoles")}</Button>
                  <Button size="small" disabled={busy} onClick={async () => {
                    setError(null);
                    const { data: r, error: e } = await supabase.rpc("member_upload_limit", { p_user_id: p.id });
                    if (e) return setError(e.message);
                    const x = r as { override_files: number | null; override_bytes: number | null; limit_files: number | null; limit_bytes: number | null; used_files: number; used_bytes: number; one_time_max_file_bytes?: number | null };
                    setLimitFor({
                      person: p, usedFiles: x.used_files, usedBytes: x.used_bytes, limitFiles: x.limit_files, limitBytes: x.limit_bytes,
                      files: x.override_files == null ? "" : String(x.override_files),
                      gb: x.override_bytes == null ? "" : String(Math.round((x.override_bytes / GB) * 100) / 100),
                      once: x.one_time_max_file_bytes ?? null, onceGb: "",
                    });
                  }}>{t("creator.people.uploadLimit")}</Button>
                </div>
              </div>
              {selected?.id === p.id && (
                <div style={{ marginTop: 12 }}>
                  <p className="tiny" style={{ marginBottom: 8 }}>{t("creator.people.changingFor")} <strong>{p.name}, {p.email}</strong></p>
                  {ROLES.map((r) => {
                    const has = p.roles.includes(r.code);
                    const needsTwoStep = !has && (r.code === "watcher" || r.code === "deacon") && data.security.requireTwoStepForStaff && !p.has_two_step;
                    return (
                      <label key={r.code} className="check-item" style={{ alignItems: "flex-start" }}>
                        <input type="checkbox" checked={has} disabled={needsTwoStep} style={{ width: "auto", marginTop: 3 }} onChange={() => toggleRole(p, r, !has)} />
                        <span>
                          <strong>{r.label}</strong> — {t(r.help)}
                          {needsTwoStep && <span className="tiny"> {t("creator.people.needsTwoStep")}</span>}
                        </span>
                        {needsTwoStep && (
                          <Button size="small" disabled={busy} onClick={(e) => {
                            e.preventDefault();
                            perform(() => supabase.rpc("ask_for_two_step", { p_user_id: p.id }), t("creator.people.asked", { name: p.name }));
                          }}>{t("creator.people.askThem")}</Button>
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
              <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.limit.for", { name: limitFor.person.name })}</p>
              <p className="tiny" style={{ marginBottom: 8 }}>
                {limitFor.limitFiles === null ? t("creator.limit.none") : t("creator.limit.now", { files: limitFor.limitFiles.toLocaleString(lang), size: formatBytes(limitFor.limitBytes ?? 0) })}{" "}
                {t("creator.limit.used", { files: limitFor.usedFiles.toLocaleString(lang), size: formatBytes(limitFor.usedBytes) })}
              </p>
              <div className="row wrap" style={{ gap: 8 }}>
                <input style={{ width: 150 }} inputMode="numeric" placeholder={t("creator.limit.filesPh")} value={limitFor.files} onChange={(e) => setLimitFor({ ...limitFor, files: e.target.value.replace(/[^0-9]/g, "") })} />
                <input style={{ width: 150 }} inputMode="decimal" placeholder={t("creator.limit.gbPh")} value={limitFor.gb} onChange={(e) => setLimitFor({ ...limitFor, gb: e.target.value.replace(/[^0-9.]/g, "") })} />
                <Button variant="primary" size="small" disabled={busy} onClick={async () => {
                  const ok = await perform(() => supabase.rpc("set_member_upload_limit", {
                    p_user_id: limitFor.person.id,
                    p_files: limitFor.files === "" ? null : Number(limitFor.files),
                    p_bytes: limitFor.gb === "" ? null : Math.round(Number(limitFor.gb) * GB),
                  }), t("creator.limit.saved"));
                  if (ok) setLimitFor(null);
                }}>{t("common.save")}</Button>
                <Button size="small" disabled={busy} onClick={async () => {
                  const ok = await perform(() => supabase.rpc("set_member_upload_limit", { p_user_id: limitFor.person.id, p_files: null, p_bytes: null }), t("creator.limit.backNormal"));
                  if (ok) setLimitFor(null);
                }}>{t("creator.limit.useNormal")}</Button>
                <Button size="small" onClick={() => setLimitFor(null)}>{t("staff.close")}</Button>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4, fontSize: 14 }}>{t("creator.limit.onceTitle")}</p>
                <p className="tiny" style={{ marginBottom: 8 }}>{t("creator.limit.onceHelp")}</p>
                {limitFor.once !== null && <p className="tiny" style={{ marginBottom: 8, color: "var(--accent-link)" }}>{t("creator.limit.onceActive", { size: formatBytes(limitFor.once) })}</p>}
                <div className="row wrap" style={{ gap: 8 }}>
                  <input style={{ width: 150 }} inputMode="decimal" placeholder={t("creator.limit.oncePh")} value={limitFor.onceGb} onChange={(e) => setLimitFor({ ...limitFor, onceGb: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <Button variant="primary" size="small" disabled={busy || limitFor.onceGb === "" || isNaN(Number(limitFor.onceGb)) || Number(limitFor.onceGb) <= 0 || Number(limitFor.onceGb) > 2} onClick={async () => {
                    const ok = await perform(() => supabase.rpc("set_member_one_time_max", { p_user_id: limitFor.person.id, p_bytes: Math.min(2146435072, Math.round(Number(limitFor.onceGb) * GB)) }), t("creator.limit.onceSaved"));
                    if (ok) setLimitFor(null);
                  }}>{t("creator.limit.onceSave")}</Button>
                  {limitFor.once !== null && (
                    <Button size="small" disabled={busy} onClick={async () => {
                      const ok = await perform(() => supabase.rpc("set_member_one_time_max", { p_user_id: limitFor.person.id, p_bytes: null }), t("creator.limit.onceCleared"));
                      if (ok) setLimitFor(null);
                    }}>{t("creator.limit.onceClear")}</Button>
                  )}
                </div>
              </div>
            </div>
          )}

          <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>{t("creator.people.holders")}</p>
          {holderGroups.size === 0 && <p className="muted">{t("creator.people.noHolders")}</p>}
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
                          title: t("creator.takeAway", { role: def?.label ?? role }),
                          body: t("creator.removeBody", { name: nameOf(userId), role: def?.label ?? role }),
                          go: () => supabase.rpc("revoke_role", { p_user_id: userId, p_role: role }),
                          done: t("creator.roleRemoved", { role: def?.label ?? role }),
                        });
                      }}
                    >
                      {t("creator.removeRole", { role: def?.label ?? role })}
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
            {t("creator.acc.help")}
          </p>
          {data.accounts.length === 0 && <p className="muted">{t("creator.acc.none")}</p>}
          {data.accounts.map((a) => (
            <div className="card" key={a.user_id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <p style={{ fontWeight: 500, margin: 0 }}>{a.name} <span className="tiny">({a.email})</span></p>
                <span className="row" style={{ gap: 6 }}>
                  {a.account_status !== "active" && <Badge variant="warn">{STATUS_KEY[a.account_status] ? t(STATUS_KEY[a.account_status]) : a.account_status}</Badge>}
                  {a.referral_id && <Badge variant="warn">{t("creator.acc.reported5")}</Badge>}
                </span>
              </div>
              <p className="tiny" style={{ margin: "0 0 6px" }}>
                {t("creator.acc.record")} <strong>{a.record}</strong>
                {a.status_reason ? ` · ${t("creator.acc.reason", { reason: a.status_reason })}` : ""}
                {a.status_changed_at ? ` · ${t("creator.acc.since", { time: when(a.status_changed_at) })}` : ""}
              </p>
              <div className="row wrap" style={{ gap: 6 }}>
                <Button size="small" onClick={() => downloadRecord(a.user_id, a.name)}>{t("creator.acc.downloadRecord")}</Button>
                {a.account_status === "suspended" && (
                  <>
                    <Button size="small" variant="primary" onClick={() => setConfirm({
                      title: t("creator.acc.liftTitle"), body: t("creator.acc.liftBody", { name: a.name }),
                      go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "active" }), done: t("creator.acc.lifted"),
                    })}>{t("creator.acc.lift")}</Button>
                    <Button size="small" onClick={() => { setReason(""); setConfirm({
                      title: t("creator.acc.restrictTitle"), body: t("creator.acc.restrictBody", { name: a.name }),
                      reasonFor: "warn",
                      go: (r) => supabase.rpc("restrict_account", { p_user_id: a.user_id, p_reason: r }), done: t("creator.acc.restricted"),
                    }); }}>{t("creator.acc.restrictTitle")}</Button>
                  </>
                )}
                {a.account_status === "deleted" ? (
                  <Button size="small" variant="primary" onClick={() => setConfirm({
                    title: t("creator.acc.restoreTitle"), body: t("creator.acc.restoreBody", { name: a.name }),
                    go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "active" }), done: t("creator.acc.restored"),
                  })}>{t("creator.restore")}</Button>
                ) : a.referral_id ? (
                  <>
                    <Button size="small" variant="danger" onClick={() => setConfirm({
                      title: t("creator.acc.deleteTitle"), danger: true,
                      body: t("creator.acc.deleteBodyRecord", { name: a.name }),
                      go: () => supabase.rpc("decide_referral", { p_referral_id: a.referral_id, p_decision: "delete" }), done: t("creator.acc.deleted"),
                    })}>{t("creator.acc.deleteBtn")}</Button>
                    <Button size="small" onClick={() => setConfirm({
                      title: t("creator.acc.dismissTitle"), body: t("creator.acc.dismissBody"),
                      go: () => supabase.rpc("decide_referral", { p_referral_id: a.referral_id, p_decision: "dismiss" }), done: t("staff.done.dismissed"),
                    })}>{t("staff.dismissReport")}</Button>
                  </>
                ) : (
                  <Button size="small" variant="danger" onClick={() => setConfirm({
                    title: t("creator.acc.deleteTitle"), danger: true,
                    body: t("creator.acc.deleteBody", { name: a.name }),
                    go: () => supabase.rpc("set_account_status", { p_user_id: a.user_id, p_status: "deleted", p_reason: "reviewed by the Creator" }), done: t("creator.acc.deleted"),
                  })}>{t("creator.acc.deleteBtn")}</Button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "trash" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            {t("creator.trash.help")}
          </p>
          {data.trash.length === 0 && <p className="muted">{t("creator.trash.none")}</p>}
          {data.trash.map((row) => (
            <div className="card" key={`${row.kind}:${row.id}`}>
              <div className="row between wrap" style={{ gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 500, margin: 0 }}>{row.title || t("creator.trash.untitled")} <Badge variant="neutral">{KIND_KEY[row.kind === "post" ? "post" : row.kind] ? t(KIND_KEY[row.kind]) : row.kind}</Badge></p>
                  <p className="tiny" style={{ margin: 0 }}>
                    {t("creator.trash.meta", { author: nameOf(row.author_id), time: when(row.deleted_at), by: nameOf(row.deleted_by) })}
                    {row.deleted_reason ? ` · ${t("creator.acc.reason", { reason: reasonText(t, row.deleted_reason, row.deleted_reason) })}` : ""}
                  </p>
                </div>
                <Button size="small" variant="primary" disabled={busy} onClick={() => perform(() => supabase.rpc("restore_item", { p_kind: row.kind, p_id: row.id }), t("creator.trash.restored"))}>{t("creator.restore")}</Button>
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "log" && (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            {t("creator.log.help")}
          </p>
          {data.log.length === 0 && <p className="muted">{t("creator.log.none")}</p>}
          {data.log.map((l) => {
            const text = ACTION_KEY[l.action] ? t(ACTION_KEY[l.action], { kind: KIND_KEY[l.target_kind ?? ""] ? t(KIND_KEY[l.target_kind ?? ""]) : t("creator.kindWord.item") }) : l.action;
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
                      {when(l.created_at)} · {t("creator.log.by", { name: nameOf(l.actor_id) })}{l.actor_role ? ` (${l.actor_role})` : ""}
                      {reasonLabel ? ` · ${reasonLabel}` : ""}
                      {wasUndone ? ` · ${t("creator.log.undone")}` : ""}
                    </p>
                  </div>
                  {UNDOABLE.has(l.action) && l.undoes == null && !wasUndone && (
                    <Button size="small" disabled={busy} onClick={() => perform(() => supabase.rpc("undo_activity", { p_log_id: l.id }), t("creator.log.undoneDone"))}>{t("creator.log.undo")}</Button>
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
          <StorageCard />
          <KnowledgePanel />
        </>
      )}

      {tab === "hub" && (
        <>
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.hub.annTitle")}</p>
            <p className="muted" style={{ marginBottom: 10 }}>{t("creator.hub.annHelp")}</p>
            <input value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder={t("creator.hub.annTitlePh")} maxLength={200} />
            <textarea value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder={t("creator.hub.annBodyPh")} style={{ marginTop: 8 }} />
            <Button variant="primary" style={{ marginTop: 8 }} disabled={busy || !annTitle.trim() || !annBody.trim()}
              onClick={async () => {
                const ok = await perform(() => supabase.rpc("post_announcement", { p_title: annTitle, p_body: annBody }), t("creator.hub.annPosted"));
                if (ok) { setAnnTitle(""); setAnnBody(""); }
              }}>
              {t("creator.hub.annPost")}
            </Button>
          </div>
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.hub.limitTitle")}</p>
            <p className="muted" style={{ marginBottom: 10 }}>
              {t("creator.hub.limitHelp")}
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              <input style={{ width: 150 }} inputMode="numeric" value={upFiles} onChange={(e) => setUpFiles(e.target.value.replace(/[^0-9]/g, ""))} aria-label={t("creator.hub.filesLabel")} />
              <span className="tiny">{t("creator.hub.filesAnd")}</span>
              <input style={{ width: 150 }} inputMode="decimal" value={upGb} onChange={(e) => setUpGb(e.target.value.replace(/[^0-9.]/g, ""))} aria-label={t("creator.hub.gbLabel")} />
              <span className="tiny">{t("creator.hub.gbPer")}</span>
              <Button variant="primary" size="small" disabled={busy || upFiles === "" || upGb === "" || isNaN(Number(upGb))} onClick={async () => {
                const ok1 = await perform(() => supabase.rpc("set_hub_setting", { p_key: "upload_daily_files", p_value: Number(upFiles) }), t("creator.limit.saved"));
                if (ok1) await perform(() => supabase.rpc("set_hub_setting", { p_key: "upload_daily_bytes", p_value: Math.round(Number(upGb) * GB) }), t("creator.limit.saved"));
              }}>{t("common.save")}</Button>
            </div>
            <p className="muted" style={{ margin: "12px 0 6px" }}>{t("creator.hub.maxFileHelp")}</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <input style={{ width: 150 }} inputMode="decimal" value={upMaxGb} onChange={(e) => setUpMaxGb(e.target.value.replace(/[^0-9.]/g, ""))} aria-label={t("creator.hub.maxFileLabel")} />
              <span className="tiny">{t("creator.hub.maxFileUnit")}</span>
              <Button variant="primary" size="small" disabled={busy || upMaxGb === "" || isNaN(Number(upMaxGb)) || Number(upMaxGb) < 0.001 || Number(upMaxGb) > 2} onClick={() =>
                perform(() => supabase.rpc("set_hub_setting", { p_key: "upload_max_file_bytes", p_value: Math.min(2146435072, Math.round(Number(upMaxGb) * GB)) }), t("creator.limit.saved"))
              }>{t("common.save")}</Button>
            </div>
          </div>
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.hub.linksTitle")}</p>
            <p className="muted" style={{ marginBottom: 10 }}>
              {t("creator.hub.linksHelp")}
            </p>
            {data.linkHosts.map((h) => (
              <div className="row between wrap" key={h.host} style={{ gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                <span><strong>{h.name}</strong> <span className="tiny">· {h.host}</span></span>
                <Button size="small" disabled={busy} onClick={() => { if (window.confirm(t("creator.hub.linksConfirm", { host: h.host }))) perform(() => supabase.rpc("remove_link_host", { p_host: h.host }), t("creator.hub.linkRemoved", { host: h.host })); }}>{t("creator.remove")}</Button>
              </div>
            ))}
            <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
              <input style={{ width: 200 }} value={newHost} onChange={(e) => setNewHost(e.target.value)} placeholder={t("creator.hub.hostPh")} />
              <input style={{ width: 160 }} value={newHostName} onChange={(e) => setNewHostName(e.target.value)} placeholder={t("creator.hub.hostNamePh")} />
              <Button variant="primary" size="small" disabled={busy || !newHost.trim()} onClick={async () => {
                const ok = await perform(() => supabase.rpc("add_link_host", { p_host: newHost, p_name: newHostName }), t("creator.hub.hostAdded"));
                if (ok) { setNewHost(""); setNewHostName(""); }
              }}>{t("creator.hub.allowSite")}</Button>
            </div>
            {data.linkRequests.length > 0 && (
              <>
                <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>{t("creator.hub.requests")}</p>
                {data.linkRequests.map((r) => (
                  <div className="row between wrap" key={r.id} style={{ gap: 8, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
                    <span><strong>{r.host}</strong>{r.note ? <span className="tiny"> · {r.note}</span> : null} <span className="tiny">· {t("creator.hub.from", { name: nameOf(r.user_id) })}</span></span>
                    <span className="row" style={{ gap: 6 }}>
                      <Button size="small" variant="primary" disabled={busy} onClick={() => perform(() => supabase.rpc("resolve_link_host_request", { p_id: r.id, p_approve: true }), t("creator.hub.approvedTold"))}>{t("creator.hub.allow")}</Button>
                      <Button size="small" disabled={busy} onClick={() => perform(() => supabase.rpc("resolve_link_host_request", { p_id: r.id, p_approve: false }), t("creator.hub.dismissedTold"))}>{t("creator.hub.notNow")}</Button>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          <KeyHelpEditor rows={data.keyHelp} />
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("staff.rules.title")}</p>
            <p className="muted" style={{ marginBottom: 10 }}>{t("creator.hub.rulesHelp")}</p>
            <RulesButton />
          </div>
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.hub.signinTitle")}</p>
            <p className="muted" style={{ marginBottom: 8 }}>
              {t("creator.hub.recoveryHelp", { n: data.security.keysLeft })}
            </p>
            {newKeys && (
              <>
                <pre style={{ background: "var(--bg)", padding: 10, borderRadius: 8, overflowX: "auto" }}>{newKeys.join("\n")}</pre>
                <p className="tiny" style={{ marginBottom: 8 }}>{t("creator.hub.keysOnce")}</p>
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
              }}>{t("creator.hub.newKeys")}</Button>
              <Button size="small" disabled={busy} onClick={async () => {
                await supabase.rpc("lock_creator_panel");
                router.replace("/creator/unlock");
              }}>{t("creator.hub.lockNow")}</Button>
            </div>
            <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>{t("creator.hub.changeCode")}</p>
            <input type="password" value={curCode} onChange={(e) => setCurCode(e.target.value)} placeholder={t("creator.hub.currentCode")} autoComplete="off" />
            <input type="password" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder={t("creator.hub.newCode")} autoComplete="new-password" style={{ marginTop: 8 }} />
            <Button size="small" style={{ marginTop: 8 }} disabled={busy || newCode.length < 10} onClick={async () => {
              setBusy(true);
              const { data: r, error: e } = await supabase.rpc("set_creator_code", { p_new: newCode, p_current: curCode || null });
              setBusy(false);
              if (e) return setError(e.message);
              if (!(r as { ok: boolean }).ok) return setError((r as { error?: string }).error ?? t("creator.hub.codeFail"));
              setCurCode(""); setNewCode(""); setFlash(t("creator.hub.codeChanged"));
            }}>{t("creator.hub.changeCodeBtn")}</Button>
            <p className="label" style={{ fontWeight: 500, margin: "14px 0 6px" }}>{t("creator.hub.events")}</p>
            {data.security.events.length === 0 && <p className="tiny">{t("creator.hub.nothingYet")}</p>}
            {data.security.events.map((e, i) => (
              <p className="tiny" key={i} style={{ margin: "0 0 2px" }}>{when(e.at)} · {EVENT_KEY[e.kind] ? t(EVENT_KEY[e.kind]) : e.kind}</p>
            ))}
          </div>
          <div className="card">
            <p role="heading" aria-level={2} className="title" style={{ marginBottom: 4 }}>{t("creator.hub.twoStepTitle")}</p>
            <p className="muted" style={{ marginBottom: 8 }}>
              {t("creator.hub.twoStepHelp")}
            </p>
            <label className="check-item">
              <input type="checkbox" style={{ width: "auto" }} checked={data.security.requireTwoStepForStaff} disabled={busy}
                onChange={(e) => perform(() => supabase.rpc("set_hub_setting", { p_key: "require_2fa_staff", p_value: e.target.checked }), t("creator.hub.settingSaved"))} />
              <span>{t("creator.hub.twoStepRequire")}</span>
            </label>
          </div>
        </>
      )}

      <Modal open={confirm !== null} onClose={() => setConfirm(null)}>
        {confirm && (
          <>
            <p role="heading" aria-level={2} className="title">{confirm.title}</p>
            <p className="muted">{confirm.body}</p>
            {confirm.reasonFor && (
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">{t("staff.chooseReason")}</option>
                {warnReasons.map((r) => <option key={r.code} value={r.code}>{reasonText(t, r.code, r.label)}</option>)}
              </select>
            )}
            {error && <p className="muted" style={{ color: "#b5471f", marginTop: 8 }}>{error}</p>}
            <div className="row" style={{ gap: 8 }}>
              <Button variant={confirm.danger ? "danger" : "primary"} disabled={busy || (!!confirm.reasonFor && !reason)} onClick={() => perform(() => confirm.go(reason), confirm.done)}>
                {busy ? t("staff.working") : t("staff.confirm")}
              </Button>
              <Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
