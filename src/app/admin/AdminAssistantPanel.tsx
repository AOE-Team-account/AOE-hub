"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

interface OpenQuestion {
  id: string;
  question: string;
  created_at: string;
  asker: { name: string } | null;
}

interface AnsweredQuestion {
  id: string;
  question: string;
  answer: string;
  answered_at: string;
  asker: { name: string } | null;
}

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
  return (
    <>
      <QuestionsInbox />
      <KnowledgeTools />
    </>
  );
}

// Questions the assistant wasn't confident about and members sent to the
// admins. Answering notifies the asker and adds the Q&A to the assistant's
// knowledge, so the same question doesn't need an admin next time. Recently
// answered ones stay visible with a Retract option, for when an answer
// turns out to be wrong — retracting pulls it out of the index immediately
// and reopens the question rather than silently deleting it.
function QuestionsInbox() {
  const [questions, setQuestions] = useState<OpenQuestion[] | null>(null);
  const [answered, setAnswered] = useState<AnsweredQuestion[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: open } = await supabase
      .from("admin_questions")
      .select("id, question, created_at, asker:profiles!admin_questions_asker_id_fkey(name)")
      .eq("status", "open")
      .order("created_at");
    setQuestions((open ?? []) as unknown as OpenQuestion[]);
    const { data: done } = await supabase
      .from("admin_questions")
      .select("id, question, answer, answered_at, asker:profiles!admin_questions_asker_id_fkey(name)")
      .eq("status", "answered")
      .order("answered_at", { ascending: false })
      .limit(10);
    setAnswered((done ?? []) as unknown as AnsweredQuestion[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function answer(id: string) {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("answer_admin_question", { p_id: id, p_answer: text });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    // Fire-and-forget: pull the new answer into the assistant's knowledge.
    fetch("/api/admin/knowledge/index", { method: "POST" }).catch(() => {});
    setDrafts((d) => ({ ...d, [id]: "" }));
    await load();
  }

  async function retract(id: string) {
    setBusyId(id);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("retract_admin_answer", { p_id: id });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await load();
  }

  return (
    <>
      <p className="label" style={{ fontWeight: 500, margin: "20px 0 8px" }}>Questions for the admins</p>
      <p className="tiny" style={{ marginBottom: 10 }}>
        Questions the AI assistant couldn&apos;t answer confidently. Your answer is sent to the member and added to what
        the assistant knows.
      </p>
      {questions === null && <p className="muted">Loading…</p>}
      {questions?.length === 0 && <p className="muted">No open questions.</p>}
      {error && <p className="tiny" style={{ color: "#b5471f" }}>{error}</p>}
      {questions?.map((q) => (
        <div className="card" key={q.id}>
          <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
            <span className="tiny">{q.asker?.name ?? "A member"}</span>
            <span className="tiny">{new Date(q.created_at).toLocaleString()}</span>
          </div>
          <p style={{ margin: "0 0 8px" }}>{q.question}</p>
          <textarea
            rows={3}
            placeholder="Write your answer…"
            value={drafts[q.id] ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
          />
          <div style={{ marginTop: 8 }}>
            <Button variant="primary" size="small" disabled={busyId === q.id || !(drafts[q.id] ?? "").trim()} onClick={() => answer(q.id)}>
              {busyId === q.id ? "Sending…" : "Send answer"}
            </Button>
          </div>
        </div>
      ))}

      {answered !== null && answered.length > 0 && (
        <>
          <p className="tiny" style={{ fontWeight: 500, margin: "14px 0 8px" }}>Recently answered</p>
          {answered.map((q) => (
            <div className="card" key={q.id}>
              <div className="row between wrap" style={{ gap: 8, marginBottom: 6 }}>
                <span className="tiny">{q.asker?.name ?? "A member"}</span>
                <span className="tiny">{new Date(q.answered_at).toLocaleString()}</span>
              </div>
              <p className="tiny" style={{ margin: "0 0 4px" }}>{q.question}</p>
              <p style={{ margin: "0 0 8px" }}>{q.answer}</p>
              <Button size="small" disabled={busyId === q.id} onClick={() => retract(q.id)}>
                {busyId === q.id ? "Retracting…" : "Retract this answer"}
              </Button>
            </div>
          ))}
        </>
      )}
    </>
  );
}

// Adds philosophy books and keeps the assistant's index current.
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
