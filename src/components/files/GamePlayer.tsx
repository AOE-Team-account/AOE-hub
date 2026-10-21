"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/Button";

/**
 * Plays a hosted game inside a sandboxed frame. The game files come from the
 * hub's separate "play." address, so the game's code can never reach the
 * hub's sign-in. It only loads when the visitor presses Play.
 */
export function GamePlayer({ assetId }: { assetId: string }) {
  const { t } = useLanguage();
  const [src, setSrc] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  function start() {
    // play.<this site's address>, e.g. play.aoe.name (or play.localhost:3100 in development)
    const host = window.location.host.replace(/^www\./, "");
    setSrc(`${window.location.protocol}//play.${host}/${assetId}/index.html`);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {!src ? (
        <Button variant="primary" onClick={start}>▶ {t("game.play")}</Button>
      ) : (
        <>
          <iframe
            ref={frame}
            src={src}
            title="game"
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen allow-modals"
            allow="fullscreen; gamepad; autoplay"
            referrerPolicy="no-referrer"
            style={{ width: "100%", height: "70vh", minHeight: 320, border: "1px solid var(--border)", borderRadius: 10, background: "#000" }}
          />
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <Button size="small" onClick={() => frame.current?.requestFullscreen?.()}>{t("game.fullscreen")}</Button>
            <Button size="small" onClick={() => setSrc(null)}>{t("game.close")}</Button>
          </div>
        </>
      )}
      <p className="tiny" style={{ marginTop: 6 }}>{t("game.note")}</p>
    </div>
  );
}
