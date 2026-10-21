"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";
import { AiDataCard } from "./AiDataCard";

interface PhilosophyBook {
  id: string;
  title: string;
  characters: number;
  createdAt: string;
}

interface KnowledgeStatus {
  documents: number;
  pendingDocuments: number;
  books: PhilosophyBook[];
}

export function KnowledgePanel() {
  const { t } = useLanguage();
  return (
    <>
      <p className="label" style={{ fontWeight: 500, margin: "0 0 8px" }}>{t("creator.kn.aiStatus")}</p>
      <AiDataCard />
      <KnowledgeTools />
    </>
  );
}

function KnowledgeTools() {
  const { t, lang } = useLanguage();
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"adding" | "indexing" | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/creator/knowledge");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setStatus(data);
    else setError(data?.error ?? t("creator.kn.readFail"));
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  // Each call embeds for up to ~40s; repeat until nothing is left waiting.
  async function updateIndex() {
    setBusy("indexing");
    setError(null);
    setMessage(null);
    try {
      for (let i = 0; i < 200; i++) {
        const res = await fetch("/api/creator/knowledge/index", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? t("creator.ai.indexFail"));
          break;
        }
        await refresh();
        if (data.done) {
          setMessage(t("creator.kn.upToDate"));
          break;
        }
      }
    } finally {
      setBusy(null);
    }
  }

  async function addBook() {
    setBusy("adding");
    setError(null);
    setMessage(null);
    const form = new FormData();
    form.set("title", title);
    if (file) form.set("file", file);
    else form.set("text", text);
    const res = await fetch("/api/creator/knowledge", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      setError(data?.error ?? t("creator.kn.addFail"));
      return;
    }
    setTitle("");
    setText("");
    setFile(null);
    await updateIndex();
  }

  async function deleteBook(id: string, bookTitle: string) {
    if (!window.confirm(t("creator.kn.confirmRemove", { title: bookTitle }))) return;
    setBusy(id);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/creator/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data?.error ?? t("creator.kn.deleteFail"));
      return;
    }
    setMessage(t("creator.kn.removed", { title: bookTitle }));
    await refresh();
  }

  return (
    <>
      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>{t("creator.kn.knowledge")}</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        {t("creator.kn.knowledgeHelp")}
      </p>
      <div className="card">
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {status ? t("creator.kn.docsWaiting", { docs: status.documents, waiting: status.pendingDocuments }) : t("common.loading")}
        </p>
        <Button size="small" disabled={busy !== null} onClick={updateIndex}>
          {busy === "indexing" ? t("creator.kn.updating") : t("creator.ai.updateIndex")}
        </Button>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{t("creator.kn.addTitle")}</p>
        <input placeholder={t("creator.kn.titlePh")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          type="file"
          accept=".txt,.md,.markdown,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ marginTop: 8 }}
        />
        <p className="tiny" style={{ margin: "6px 0" }}>{t("creator.kn.orPaste")}</p>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={!!file} />
        <div style={{ marginTop: 8 }}>
          <Button variant="primary" size="small" disabled={busy !== null || !title.trim() || (!file && text.trim().length < 50)} onClick={addBook}>
            {busy === "adding" ? t("creator.kn.adding") : t("creator.kn.addIndex")}
          </Button>
        </div>
        <p className="tiny" style={{ marginTop: 6 }}>
          {t("creator.kn.addHelp")}
        </p>
      </div>

      {status && status.books.length > 0 && (() => {
        const q = search.trim().toLowerCase();
        const shown = q ? status.books.filter((b) => b.title.toLowerCase().includes(q)) : status.books;
        return (
          <div className="card" style={{ marginTop: 10 }}>
            <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>{t("creator.kn.booksTitle", { n: status.books.length })}</p>
            <input
              type="search"
              placeholder={t("creator.kn.searchPh")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t("creator.kn.searchLabel")}
              style={{ marginBottom: 8 }}
            />
            {q && <p className="tiny" style={{ margin: "0 0 6px" }}>{t("creator.kn.showing", { shown: shown.length, total: status.books.length })}</p>}
            {shown.length === 0 && <p className="muted">{t("creator.kn.noMatch", { q: search })}</p>}
            {shown.map((b) => (
              <div className="row between wrap" key={b.id} style={{ gap: 8, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <div>
                  <p style={{ margin: 0 }}>{b.title}</p>
                  <p className="tiny" style={{ margin: 0 }}>
                    {t("creator.kn.bookMeta", { n: b.characters.toLocaleString(lang), date: new Date(b.createdAt).toLocaleDateString(lang) })}
                  </p>
                </div>
                <Button size="small" variant="danger" disabled={busy !== null} onClick={() => deleteBook(b.id, b.title)}>
                  {busy === b.id ? t("creator.kn.removing") : t("common.delete")}
                </Button>
              </div>
            ))}
          </div>
        );
      })()}

      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 8, color: "#b5471f" }}>{error}</p>}
    </>
  );
}
