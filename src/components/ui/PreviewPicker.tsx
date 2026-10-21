"use client";

import { useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBytes } from "@/lib/format";
import { IMAGE_ACCEPT, MEDIA_LIMITS, VIDEO_ACCEPT } from "@/lib/media";
import { videoSeconds } from "@/lib/media-client";

/**
 * The optional "Previews" part of a form. `single` = one picture only (an
 * experience post); otherwise several pictures and a couple of short videos
 * (a file post). The chosen files stay in the form until the post is sent.
 */
export function PreviewPicker({
  single = false,
  images,
  videos,
  onChange,
}: {
  single?: boolean;
  images: File[];
  videos: File[];
  onChange: (images: File[], videos: File[]) => void;
}) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const maxImages = single ? MEDIA_LIMITS.experienceImages : MEDIA_LIMITS.fileImages;

  function addImages(list: FileList | null) {
    setError(null);
    if (!list) return;
    const next = [...images];
    for (const f of Array.from(list)) {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) { setError(t("previews.tooMany", { images: maxImages, videos: MEDIA_LIMITS.fileVideos })); continue; }
      if (f.size > MEDIA_LIMITS.imageInputBytes) { setError(t("previews.imageTooBig", { size: formatBytes(MEDIA_LIMITS.imageInputBytes) })); continue; }
      if (next.length >= maxImages) { setError(t("previews.tooMany", { images: maxImages, videos: MEDIA_LIMITS.fileVideos })); break; }
      next.push(f);
    }
    onChange(next, videos);
    if (imageInput.current) imageInput.current.value = "";
  }

  async function addVideo(list: FileList | null) {
    setError(null);
    const f = list?.[0];
    if (videoInput.current) videoInput.current.value = "";
    if (!f) return;
    if (!/^video\/(mp4|webm)$/.test(f.type)) return setError(t("previews.videoType"));
    if (f.size > MEDIA_LIMITS.videoBytes) return setError(t("previews.videoTooBig", { size: formatBytes(MEDIA_LIMITS.videoBytes) }));
    if (videos.length >= MEDIA_LIMITS.fileVideos) return setError(t("previews.tooMany", { images: maxImages, videos: MEDIA_LIMITS.fileVideos }));
    const secs = await videoSeconds(f);
    if (Number.isFinite(secs) && secs > MEDIA_LIMITS.videoSeconds + 1) return setError(t("previews.videoTooLong", { minutes: MEDIA_LIMITS.videoSeconds / 60 }));
    onChange(images, [...videos, f]);
  }

  return (
    <div style={{ marginTop: 16 }}>
      <label className="field-label">{single ? t("previews.onePicture") : t("previews.title")}</label>
      {!single && (
        <p className="tiny" style={{ marginBottom: 8 }}>
          {t("previews.help", {
            images: MEDIA_LIMITS.fileImages,
            videos: MEDIA_LIMITS.fileVideos,
            minutes: MEDIA_LIMITS.videoSeconds / 60,
            size: formatBytes(MEDIA_LIMITS.videoBytes),
          })}
        </p>
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <input ref={imageInput} type="file" accept={IMAGE_ACCEPT} multiple={!single} style={{ display: "none" }} onChange={(e) => addImages(e.target.files)} />
        <button className="btn small" type="button" disabled={images.length >= maxImages} onClick={() => imageInput.current?.click()}>
          {single ? t("previews.onePicture") : t("previews.addImages")}
        </button>
        {!single && (
          <>
            <input ref={videoInput} type="file" accept={VIDEO_ACCEPT} style={{ display: "none" }} onChange={(e) => addVideo(e.target.files)} />
            <button className="btn small" type="button" disabled={videos.length >= MEDIA_LIMITS.fileVideos} onClick={() => videoInput.current?.click()}>
              {t("previews.addVideo")}
            </button>
          </>
        )}
      </div>
      <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
        {images.map((f, i) => (
          <span key={`i${i}`} style={{ position: "relative" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt="" style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
            <button type="button" className="btn small" style={{ position: "absolute", top: 2, right: 2, padding: "0 6px" }} aria-label={t("previews.remove")} onClick={() => onChange(images.filter((_, idx) => idx !== i), videos)}>×</button>
          </span>
        ))}
        {videos.map((f, i) => (
          <span key={`v${i}`} className="tiny" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 8px" }}>
            ▶ {f.name.slice(0, 22)} · {formatBytes(f.size)}
            <button type="button" className="btn small" style={{ padding: "0 6px" }} aria-label={t("previews.remove")} onClick={() => onChange(images, videos.filter((_, idx) => idx !== i))}>×</button>
          </span>
        ))}
      </div>
      {!single && videos.length > 0 && <p className="tiny" style={{ marginTop: 6 }}>{t("previews.videoChecking")}</p>}
      {error && <p className="tiny" style={{ color: "#b5471f", marginTop: 6 }}>{error}</p>}
    </div>
  );
}
