"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import type { ExperienceCategory } from "@/lib/types";

const CATEGORIES: { value: ExperienceCategory; label: string }[] = [
  { value: "starting-out", label: "Starting out" },
  { value: "milestones", label: "Milestones" },
  { value: "struggles", label: "Struggles & lessons" },
  { value: "curriculum-reviews", label: "Curriculum reviews" },
  { value: "philosophy", label: "Philosophy" },
  { value: "reflections", label: "Reflections" },
  { value: "just-sharing", label: "Just sharing" },
];

export default function NewExperiencePostPage() {
  const ready = useRequireAuthPage("/experience");
  const { user } = useAuth();
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [category, setCategory] = useState<ExperienceCategory>("starting-out");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;

  async function submit() {
    if (!user || !body.trim()) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("experience_posts")
      .insert({ author_id: user.id, category, body: body.trim() });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push("/experience");
    router.refresh();
  }

  return (
    <>
      <BackLink href="/experience" label="Cancel" />
      <p className="title" style={{ marginBottom: 14 }}>Share an experience</p>

      <label className="field-label">What kind of post is this?</label>
      <select value={category} onChange={(e) => setCategory(e.target.value as ExperienceCategory)}>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>

      <label className="field-label">Your story</label>
      <textarea
        placeholder="What happened, what did you try, what did you learn?"
        style={{ minHeight: 140 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="card" style={{ background: "var(--bg)", borderStyle: "dashed", marginTop: 18 }}>
        <p className="muted" style={{ marginBottom: 10 }}>
          What you share here is public and free to everyone — anyone can read it, quote it, and learn from it. Are
          you aware of that?
        </p>
        <Button onClick={() => setAcknowledged(true)} disabled={acknowledged}>
          {acknowledged ? "✓ Acknowledged" : "I'm aware, continue"}
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
        {submitting ? "Posting…" : "Post to the Experience Board"}
      </Button>
    </>
  );
}
