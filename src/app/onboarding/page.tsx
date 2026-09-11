"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ChipRow } from "@/components/ui/ChipRow";

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
  const { consumePendingReturn } = useAuth();
  const router = useRouter();
  const [experience, setExperience] = useState<Experience>("new");
  const [reason, setReason] = useState<Reason>("notsure");

  function finish(showWelcome: boolean) {
    const target = consumePendingReturn();
    if (showWelcome && target === "/experience") {
      window.localStorage.setItem("aoehub.showNewcomerWelcome", "1");
    }
    router.push(target);
  }

  return (
    <>
      <p className="title" style={{ marginBottom: 4 }}>
        Welcome to AOEhub
      </p>
      <p className="muted" style={{ marginBottom: 20 }}>
        Two quick questions — totally optional, just helps us show you the right things first.
      </p>

      <p className="field-label" style={{ marginTop: 0 }}>
        New to homeschooling, or been at it a while?
      </p>
      <ChipRow options={Q1_OPTIONS} value={experience} onChange={setExperience} />

      <p className="field-label">What brought you here?</p>
      <ChipRow options={Q2_OPTIONS} value={reason} onChange={setReason} />

      <button className="btn primary" style={{ width: "100%", marginTop: 20 }} onClick={() => finish(experience === "new")}>
        Continue
      </button>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => finish(false)}>
        Skip for now
      </button>
    </>
  );
}
