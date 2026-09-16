"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";

export default function NewAnnouncementPage() {
  const ready = useRequireAuthPage("/experience", (user) => user.isAdmin);
  const { user } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return null;

  async function submit() {
    if (!user || !title.trim() || !message.trim()) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("experience_posts").insert({
      author_id: user.id,
      title: title.trim(),
      body: message.trim(),
      pinned: true,
      is_announcement: true,
    });
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
      <p className="title" style={{ marginBottom: 4 }}>Post an announcement</p>
      <p className="tiny" style={{ marginBottom: 14 }}>This pins to the top of the Experience Board for everyone signed in.</p>

      <label className="field-label">Title</label>
      <input
        placeholder="e.g. New feature, policy update, maintenance notice"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <label className="field-label">Message</label>
      <textarea placeholder="What do people need to know?" value={message} onChange={(e) => setMessage(e.target.value)} />

      {error && (
        <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
          {error}
        </p>
      )}

      <Button
        variant="primary"
        style={{ width: "100%", marginTop: 18 }}
        disabled={!title.trim() || !message.trim() || submitting}
        onClick={submit}
      >
        {submitting ? "Posting…" : "Post & pin announcement"}
      </Button>
    </>
  );
}
