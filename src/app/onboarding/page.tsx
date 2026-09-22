"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { ChipRow } from "@/components/ui/ChipRow";
import { AiKeyForm, type AiKeyFormHandle } from "@/components/ai/AiKeyForm";

// Q1 widened from a homeschooling-experience scale to a broader "what's your
// situation" question, since the hub's stated audience is homeschool/
// unschool/school families alike, not just homeschoolers (2026-09 memory doc
// update). Which welcome card a newcomer sees on the Experience Board
// depends on this answer — see finish() below.
type Situation = "homeschooling" | "in-school" | "unschooling" | "want-to-know-more" | "new-way-of-learning";
type Reason = "curriculum" | "community" | "philosophy" | "notsure";
// "unspecified" (not stored) represents a genuinely skipped answer, the same
// way Q2 already uses "notsure" as its no-real-answer default.
type Referral = "friend" | "web-search" | "social-media" | "youtube" | "other" | "unspecified";

// Q1/Q3 copy below is a first-pass draft, not final — the project owner
// wants exact wording decided together with the marketing page rewrite in
// Phase 6, not invented in isolation here. Functionally correct and fine to
// ship in the meantime; expect these strings to change.
const Q1_OPTIONS: { value: Situation; label: string }[] = [
  { value: "homeschooling", label: "Homeschooling" },
  { value: "in-school", label: "In school" },
  { value: "unschooling", label: "Unschooling" },
  { value: "want-to-know-more", label: "Want to know more about education" },
  { value: "new-way-of-learning", label: "Just want to see a new way of learning" },
];

const Q2_OPTIONS: { value: Reason; label: string }[] = [
  { value: "curriculum", label: "Curriculum ideas" },
  { value: "community", label: "Community & support" },
  { value: "philosophy", label: "Philosophy & the big picture" },
  { value: "notsure", label: "Not sure yet" },
];

const Q3_OPTIONS: { value: Referral; label: string }[] = [
  { value: "friend", label: "A friend" },
  { value: "web-search", label: "Web search" },
  { value: "social-media", label: "Social media" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Somewhere else" },
  { value: "unspecified", label: "Prefer not to say" },
];

export default function OnboardingPage() {
  const ready = useRequireAuthPage("/");
  const { user, consumePendingReturn } = useAuth();
  const router = useRouter();
  const [situation, setSituation] = useState<Situation>("want-to-know-more");
  const [reason, setReason] = useState<Reason>("notsure");
  const [referral, setReferral] = useState<Referral>("unspecified");
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
        .update({
          onboarding_experience: situation,
          onboarding_reason: reason,
          referral_source: referral === "unspecified" ? null : referral,
        })
        .eq("id", user.id);
      setSaving(false);
    }

    const target = consumePendingReturn();
    if (save && target === "/experience") {
      // Two different welcome cards for two different kinds of newcomer —
      // someone genuinely new to the whole idea of homeschool/unschool
      // education vs. a school family checking the hub out for the first
      // time. Someone who's already homeschooling or unschooling doesn't
      // get a welcome card at all; they already know what they're doing.
      if (situation === "want-to-know-more" || situation === "new-way-of-learning") {
        window.localStorage.setItem("aoehub.showNewcomerWelcome", "1");
      } else if (situation === "in-school") {
        window.localStorage.setItem("aoehub.showSchoolFamilyWelcome", "1");
      }
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
        What&apos;s your situation?
      </p>
      <ChipRow options={Q1_OPTIONS} value={situation} onChange={setSituation} />

      <p className="field-label">What brought you here?</p>
      <ChipRow options={Q2_OPTIONS} value={reason} onChange={setReason} />

      <p className="field-label">Where did you hear about us?</p>
      <ChipRow options={Q3_OPTIONS} value={referral} onChange={setReferral} />

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
