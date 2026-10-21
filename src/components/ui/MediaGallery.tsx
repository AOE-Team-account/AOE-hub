"use client";

import type { MediaRef } from "@/lib/media";

/** The preview pictures and videos of a file post. */
export function MediaGallery({ media }: { media: MediaRef[] }) {
  if (media.length === 0) return null;
  return (
    <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
      {media.map((m) =>
        m.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={`/api/media/${m.id}`} alt="" loading="lazy" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 10, border: "1px solid var(--border)" }} />
        ) : (
          <video key={m.id} src={`/api/media/${m.id}`} controls preload="metadata" playsInline style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 10, background: "#000" }} />
        )
      )}
    </div>
  );
}
