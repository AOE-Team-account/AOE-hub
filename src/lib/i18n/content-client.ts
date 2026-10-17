"use client";

import { useSyncExternalStore } from "react";

// Browser side of content translation: collects the "please translate this"
// requests of everything on screen into a few calls to /api/translate, keeps
// the answers, and remembers which items the reader switched back to the
// original for.

export interface ContentResult {
  text: string | null;
  source: string | null;
  status: "translated" | "same" | "paused" | "error";
}

export interface ContentRequest {
  type: string;
  id: string;
  field: string;
}

const answers = new Map<string, ContentResult>();
const waiting = new Map<string, ((r: ContentResult) => void)[]>();
let queue: { lang: string; req: ContentRequest; slot: string }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const pausedUntil = new Map<string, number>();

const slotOf = (lang: string, r: ContentRequest, text: string) => `${lang}|${r.type}:${r.id}:${r.field}|${text.length}:${text.slice(0, 24)}`;

export function peek(lang: string, req: ContentRequest, text: string): ContentResult | undefined {
  return answers.get(slotOf(lang, req, text));
}

async function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  const byLang = new Map<string, typeof batch>();
  for (const q of batch) byLang.set(q.lang, [...(byLang.get(q.lang) ?? []), q]);
  for (const [lang, items] of byLang) {
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50);
      let results: Record<string, ContentResult> = {};
      let failed = false;
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lang, items: chunk.map((c) => c.req) }),
        });
        if (res.ok) results = (await res.json()).results ?? {};
        else failed = true;
      } catch {
        failed = true;
      }
      for (const c of chunk) {
        const key = `${c.req.type}:${c.req.id}:${c.req.field}`;
        const r: ContentResult = results[key] ?? { text: null, source: null, status: failed ? "error" : "error" };
        if (r.status === "paused") pausedUntil.set(lang, Date.now() + 5 * 60_000);
        // Only settled answers are kept; a pause or error is retried on the next visit.
        if (r.status === "translated" || r.status === "same") answers.set(c.slot, r);
        for (const done of waiting.get(c.slot) ?? []) done(r);
        waiting.delete(c.slot);
      }
    }
  }
}

export function requestTranslation(lang: string, req: ContentRequest, text: string): Promise<ContentResult> {
  const slot = slotOf(lang, req, text);
  const known = answers.get(slot);
  if (known) return Promise.resolve(known);
  if ((pausedUntil.get(lang) ?? 0) > Date.now()) return Promise.resolve({ text: null, source: null, status: "paused" });
  return new Promise((resolve) => {
    const list = waiting.get(slot);
    if (list) { list.push(resolve); return; }
    waiting.set(slot, [resolve]);
    queue.push({ lang, req, slot });
    if (!timer) timer = setTimeout(flush, 40);
  });
}

// ---- "show original" per item, shared by every field of the same item ----
const original = new Set<string>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function toggleOriginal(itemKey: string) {
  if (original.has(itemKey)) original.delete(itemKey); else original.add(itemKey);
  listeners.forEach((fn) => fn());
}

export function useShowOriginal(itemKey: string): boolean {
  return useSyncExternalStore(subscribe, () => original.has(itemKey), () => false);
}
