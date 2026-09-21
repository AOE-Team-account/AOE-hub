"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { aiProvider, type AISource } from "@/lib/ai";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface ChatMessage {
  id: number;
  from: "ai" | "user";
  text: string;
  sources?: AISource[];
  // The question that could not be answered, so it can be sent to the admins.
  escalateQuestion?: string;
  isError?: boolean;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export function AiFab() {
  const { lang } = useLanguage();
  const { user, openSignInModal } = useAuth();
  const fabRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [panelPos, setPanelPos] = useState<{ left?: string; right?: string; top?: string; bottom?: string }>({
    top: "54px",
    right: "0",
  });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, from: "ai", text: "Hi! I can help you find files, point you to a philosophy idea, or explain how something on the hub works. What are you looking for?" },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = fabRef.current!.getBoundingClientRect();
    dragState.current = { dragging: true, moved: false, startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
    setPos({ left: rect.left, top: rect.top });
    btnRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    if (!state.dragging) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) state.moved = true;
    if (!state.moved || !fabRef.current) return;
    const newLeft = clamp(state.startLeft + dx, 4, window.innerWidth - fabRef.current.offsetWidth - 4);
    const newTop = clamp(state.startTop + dy, 4, window.innerHeight - fabRef.current.offsetHeight - 4);
    setPos({ left: newLeft, top: newTop });
  }

  function endDrag() {
    dragState.current.dragging = false;
  }

  function onButtonClick(e: React.MouseEvent) {
    if (dragState.current.moved) {
      dragState.current.moved = false;
      return;
    }
    e.stopPropagation();

    if (!open && fabRef.current) {
      const rect = fabRef.current.getBoundingClientRect();
      const panelWidth = Math.min(320, window.innerWidth - 28);
      const panelHeightEstimate = 380;
      const next: typeof panelPos = {};

      if (rect.right - panelWidth < 4) {
        next.left = "0";
        next.right = "auto";
      } else {
        next.right = "0";
        next.left = "auto";
      }

      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < panelHeightEstimate && rect.top > panelHeightEstimate) {
        next.top = "auto";
        next.bottom = `${(fabRef.current.offsetHeight || 46) + 8}px`;
      } else {
        next.bottom = "auto";
        next.top = "54px";
      }
      setPanelPos(next);
    }
    setOpen((o) => !o);
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || thinking) return;
    const history = messages.filter((m) => !m.isError).map((m) => ({ from: m.from, text: m.text }));
    setMessages((m) => [...m, { id: Date.now(), from: "user", text }]);
    setInput("");
    setThinking(true);
    try {
      const reply = await aiProvider.reply(text, lang, history);
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          from: "ai",
          text: reply.text,
          sources: reply.sources,
          escalateQuestion: reply.escalate ? text : undefined,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, from: "ai", text: err instanceof Error ? err.message : "Something went wrong.", isError: true },
      ]);
    } finally {
      setThinking(false);
    }
  }

  async function askAdmins(msgId: number, question: string) {
    if (!user) {
      openSignInModal();
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from("admin_questions").insert({ asker_id: user.id, question, lang });
    setMessages((all) => [
      ...all.map((m) => (m.id === msgId ? { ...m, escalateQuestion: undefined } : m)),
      {
        id: Date.now(),
        from: "ai" as const,
        text: error
          ? error.message.includes("open questions")
            ? error.message
            : "I couldn't send that to the admins. Please try again."
          : "Sent. An admin will answer, and you'll get a notification when they do.",
        isError: !!error,
      },
    ]);
  }

  const fabStyle: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: "auto" }
    : {};

  return (
    <div className="ai-fab-fixed" ref={fabRef} style={fabStyle}>
      <button
        id="ai-fab-btn"
        ref={btnRef}
        aria-label="Ask the hub AI"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={onButtonClick}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a5 5 0 0 0-5 5v2a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5Z" />
          <path d="M8 14v1a4 4 0 0 0 8 0v-1M12 19v3" />
        </svg>
      </button>

      <div
        className={`chat-panel${open ? " open" : ""}`}
        ref={panelRef}
        style={panelPos}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat-header">
          <span>Ask the hub AI</span>
          <button aria-label="Close" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>
        <div className="chat-messages">
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.from}`}>
              {m.text}
              {m.sources && m.sources.length > 0 && (
                <div className="tiny" style={{ marginTop: 6 }}>
                  From:{" "}
                  {m.sources.map((src, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      {src.href ? <Link href={src.href} style={{ color: "var(--accent)" }}>{src.title}</Link> : src.title}
                    </span>
                  ))}
                </div>
              )}
              {m.escalateQuestion && (
                <button className="btn small" style={{ marginTop: 8 }} onClick={() => askAdmins(m.id, m.escalateQuestion!)}>
                  {user ? "Send to the admins" : "Sign in to ask the admins"}
                </button>
              )}
            </div>
          ))}
          {thinking && <div className="chat-msg ai">Thinking…</div>}
        </div>
        <div className="chat-input-row">
          <input
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendChat()}
          />
          <button className="btn primary small" onClick={sendChat}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
