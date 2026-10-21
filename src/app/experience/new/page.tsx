"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";
import { friendlyWriteError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import { PreviewPicker } from "@/components/ui/PreviewPicker";
import { uploadPreviews } from "@/lib/media-client";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import type { ExperienceCategory } from "@/lib/types";

const CATEGORIES: { value: ExperienceCategory; key: UiKey }[] = [
  { value: "question", key: "xnew.cat.question" },
  { value: "starting-out", key: "exp.cat.startingOut" },
  { value: "milestones", key: "exp.cat.milestones" },
  { value: "struggles", key: "exp.cat.struggles" },
  { value: "curriculum-reviews", key: "exp.cat.curriculumReviews" },
  { value: "philosophy", key: "exp.cat.philosophy" },
  { value: "reflections", key: "exp.cat.reflections" },
  { value: "just-sharing", key: "exp.cat.justSharing" },
];

export default function NewExperiencePostPage() {
  const { t } = useLanguage();
  const ready = useRequireAuthPage("/experience");
  const { user } = useAuth();
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [category, setCategory] = useState<ExperienceCategory>("starting-out");
  const [body, setBody] = useState("");
  const [madeWithAi, setMadeWithAi] = useState(false);
  const [previewImages, setPreviewImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;

  async function submit() {
    if (!user || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { data: created, error: insertError } = await supabase
      .from("experience_posts")
      .insert({ author_id: user.id, category, body: body.trim(), made_with_ai: madeWithAi })
      .select("id")
      .single();
    if (insertError || !created) {
      setSubmitting(false);
      setError(friendlyWriteError(insertError ?? { message: "Could not post." }));
      return;
    }
    if (previewImages.length > 0) {
      const failed = await uploadPreviews("experience", created.id, previewImages);
      if (failed > 0) window.alert(t("previews.failedSome", { n: failed }));
    }
    setSubmitting(false);
    router.push("/experience");
    router.refresh();
  }

  return (
    <>
      <BackLink href="/experience" label={t("common.cancel")} />
      <p className="title" style={{ marginBottom: 14 }}>{t("xnew.title")}</p>

      <label className="field-label">{t("xnew.kind")}</label>
      <select value={category} onChange={(e) => setCategory(e.target.value as ExperienceCategory)}>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{t(c.key)}</option>
        ))}
      </select>

      <label className="field-label">{t("xnew.story")}</label>
      <textarea
        placeholder={t("xnew.storyPlaceholder")}
        style={{ minHeight: 140 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <PreviewPicker single images={previewImages} videos={[]} onChange={(i) => setPreviewImages(i)} />

      <label className="check-item" style={{ alignItems: "flex-start", marginTop: 14 }}>
        <input type="checkbox" checked={madeWithAi} onChange={(e) => setMadeWithAi(e.target.checked)} style={{ width: "auto", marginTop: 3 }} />
        <span>
          {t("upload.madeWithAi")}
          <br />
          <span className="tiny">{t("upload.madeWithAiHelp")}</span>
        </span>
      </label>

      <div className="card" style={{ background: "var(--bg)", borderStyle: "dashed", marginTop: 18 }}>
        <p className="muted" style={{ marginBottom: 10 }}>
          {t("xnew.publicNotice")}
        </p>
        <Button onClick={() => setAcknowledged(true)} disabled={acknowledged}>
          {acknowledged ? t("upload.acknowledged") : t("upload.aware")}
        </Button>
      </div>

      {error && (
        <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
          {error}
        </p>
      )}

      <Button
        variant="primary"
        style={{ width: "100%", marginTop: 14 }}
        disabled={!acknowledged || !body.trim() || submitting}
        onClick={submit}
      >
        {submitting ? t("discussion.posting") : t("xnew.post")}
      </Button>
    </>
  );
}
