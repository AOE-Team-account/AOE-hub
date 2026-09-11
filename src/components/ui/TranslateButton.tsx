"use client";

import { useState } from "react";
import { translateContent } from "@/lib/i18n/translate";
import { Button } from "./Button";

/** Wraps a piece of user-generated text with an on-demand "Translate"
 *  toggle. Only the surrounding text is ever translated — never a
 *  downloaded file's actual contents. */
export function TranslatableText({ text, as: Tag = "p", className }: { text: string; as?: "p" | "span"; className?: string }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const showingTranslation = translated !== null;

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (showingTranslation) {
      setTranslated(null);
      return;
    }
    setLoading(true);
    try {
      setTranslated(await translateContent(text));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Tag className={className}>{showingTranslation ? translated : text}</Tag>
      <Button size="small" onClick={toggle} disabled={loading} style={{ marginBottom: 8 }}>
        {loading ? "Translating…" : showingTranslation ? "🌐 Show original" : "🌐 Translate"}
      </Button>
    </>
  );
}
