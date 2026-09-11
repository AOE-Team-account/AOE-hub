"use client";

import { useRef, useState } from "react";
import { aiProvider } from "@/lib/ai";
import { useLanguage } from "@/contexts/LanguageContext";

interface ChatMessage {
  id: number;
  from: "ai" | "user";
  text: string;
}

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export function AiFab() {
  const { lang } = useLanguage();
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
    if (!text) return;
    const userMsg: ChatMessage = { id: Date.now(), from: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    const reply = await aiProvider.reply(text, lang);
    setMessages((m) => [...m, { id: Date.now() + 1, from: "ai", text: reply }]);
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
            </div>
          ))}
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
