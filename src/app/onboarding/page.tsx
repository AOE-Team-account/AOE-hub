"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { ChipRow } from "@/components/ui/ChipRow";
import { AiKeyForm, type AiKeyFormHandle } from "@/components/ai/AiKeyForm";

type Experience = "new" | "some" | "years";
type Reason = "curriculum" | "community" | "philosophy" | "notsure";

const Q1_OPTIONS: { value: Experience; label: string }[] = [
  { value: "new", label: "New to this" },
  { value: "some", label: "Some experience" },
  { value: "years", label: "Years of experience" },
];

const Q2_OPTIONS: { value: Reason; label: string }[] = [
  { value: "curriculum", label: "Curriculum ideas" },
  { value: "community", label: "Community & support" },
  { value: "philosophy", label: "Philosophy & the big picture" },
  { value: "notsure", label: "Not sure yet" },
];

export default function OnboardingPage() {
  const ready = useRequireAuthPage("/");
  const { user, consumePendingReturn } = useAuth();
  const router = useRouter();
  const [experience, setExperience] = useState<Experience>("new");
  const [reason, setReason] = useState<Reason>("notsure");
  const [saving, setSaving] = useState(false);
  const keyForm = useRef<AiKeyFormHandle>(null);

  async function finish(save: boolean) {
    if (save && user) {
      setSaving(true);
      // A typed-in AI key is verified first; if it's wrong, stay here so it
      // can be fixed (the form shows why) rather than silently dropping it.
      if (!(await keyForm.current?.submitIfFilled())) {
        setSaving(false);
        return;
      }
      const supabase = createClient();
      await supabase
        .from("profiles")
        .update({ onboarding_experience: experience, onboarding_reason: reason })
        .eq("id", user.id);
      setSaving(false);
    }

    const target = consumePendingReturn();
    if (save && experience === "new" && target === "/experience") {
      window.localStorage.setItem("aoehub.showNewcomerWelcome", "1");
    }
    router.push(target);
  }

  if (!ready) return null;

  return (
    <>
      <p className="title" style={{ marginBottom: 4 }}>
        Welcome to AOEhub
      </p>
      <p className="muted" style={{ marginBottom: 20 }}>
        A few quick questions — totally optional, just helps us show you the right things first.
      </p>

      <p className="field-label" style={{ marginTop: 0 }}>
        New to homeschooling, or been at it a while?
      </p>
      <ChipRow options={Q1_OPTIONS} value={experience} onChange={setExperience} />

      <p className="field-label">What brought you here?</p>
      <ChipRow options={Q2_OPTIONS} value={reason} onChange={setReason} />

      <p className="field-label">Have your own AI API key, or want to use one?</p>
      <p className="tiny" style={{ marginBottom: 8 }}>
        You can paste it here — otherwise we&apos;ll use ours, though it may not be as good as your own. You can also add it
        later in Settings.
      </p>
      <AiKeyForm ref={keyForm} standalone={false} />

      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 20 }}
        disabled={saving}
        onClick={() => finish(true)}
      >
        {saving ? "Saving…" : "Continue"}
      </button>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={saving} onClick={() => finish(false)}>
        Skip for now
      </button>
    </>
  );
}
