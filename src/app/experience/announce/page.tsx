"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuthPage } from "@/contexts/AuthContext";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";

export default function NewAnnouncementPage() {
  const ready = useRequireAuthPage("/experience", (user) => user.isAdmin);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  if (!ready) return null;

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

      <Button
        variant="primary"
        style={{ width: "100%", marginTop: 18 }}
        disabled={!title.trim() || !message.trim()}
        onClick={() => router.push("/experience")}
      >
        Post &amp; pin announcement
      </Button>
    </>
  );
}
