"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

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

export function AdminAssistantPanel() {
  return <KnowledgeTools />;
}

function KnowledgeTools() {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"adding" | "indexing" | string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/knowledge");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setStatus(data);
    else setError(data?.error ?? "Could not read the knowledge base.");
  }, []);

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
        const res = await fetch("/api/admin/knowledge/index", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data?.error ?? "Indexing failed.");
          break;
        }
        await refresh();
        if (data.done) {
          setMessage("The assistant's knowledge is up to date.");
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
    const res = await fetch("/api/admin/knowledge", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(null);
      setError(data?.error ?? "Could not add the book.");
      return;
    }
    setTitle("");
    setText("");
    setFile(null);
    await updateIndex();
  }

  async function deleteBook(id: string, bookTitle: string) {
    if (!window.confirm(`Remove "${bookTitle}" from the assistant's knowledge? This can't be undone.`)) return;
    setBusy(id);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/admin/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data?.error ?? "Could not delete the book.");
      return;
    }
    setMessage(`Removed "${bookTitle}".`);
    await refresh();
  }

  return (
    <>
      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Assistant knowledge</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        The assistant answers from the hub&apos;s posts, files, its guide, admin answers, and the philosophy books added
        here. New and edited posts are picked up when you update the index.
      </p>
      <div className="card">
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {status ? `${status.documents} documents · ${status.pendingDocuments} waiting to be indexed` : "Loading…"}
        </p>
        <Button size="small" disabled={busy !== null} onClick={updateIndex}>
          {busy === "indexing" ? "Updating…" : "Update index"}
        </Button>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>Add a philosophy book</p>
        <input placeholder="Book title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input
          type="file"
          accept=".txt,.md,.markdown,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ marginTop: 8 }}
        />
        <p className="tiny" style={{ margin: "6px 0" }}>…or paste the text:</p>
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={!!file} />
        <div style={{ marginTop: 8 }}>
          <Button variant="primary" size="small" disabled={busy !== null || !title.trim() || (!file && text.trim().length < 50)} onClick={addBook}>
            {busy === "adding" ? "Adding…" : "Add and index"}
          </Button>
        </div>
        <p className="tiny" style={{ marginTop: 6 }}>
          Adding a book with the same title replaces the old copy. .txt, .md, .pdf, and .epub are supported — a scanned PDF with no selectable text won&apos;t work, since nothing here can read text out of an image.
        </p>
      </div>

      {status && status.books.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <p style={{ fontWeight: 500, fontSize: 14, margin: "0 0 8px" }}>Philosophy books ({status.books.length})</p>
          {status.books.map((b) => (
            <div className="row between wrap" key={b.id} style={{ gap: 8, padding: "6px 0" }}>
              <div>
                <p style={{ margin: 0 }}>{b.title}</p>
                <p className="tiny" style={{ margin: 0 }}>
                  {b.characters.toLocaleString()} characters · added {new Date(b.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button size="small" variant="danger" disabled={busy !== null} onClick={() => deleteBook(b.id, b.title)}>
                {busy === b.id ? "Removing…" : "Delete"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {message && <p className="tiny" style={{ marginTop: 8 }}>{message}</p>}
      {error && <p className="tiny" style={{ marginTop: 8, color: "#b5471f" }}>{error}</p>}
    </>
  );
}
