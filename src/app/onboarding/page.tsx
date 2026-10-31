"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { ChipRow } from "@/components/ui/ChipRow";
import { AiKeyForm, type AiKeyFormHandle } from "@/components/ai/AiKeyForm";
import { RegionPicker } from "@/components/ai/RegionPicker";
import type { Region } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import type { UiKey } from "@/lib/i18n/strings";

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

const Q1_KEYS: { value: Situation; label: UiKey }[] = [
  { value: "homeschooling", label: "onboarding.q1.homeschooling" },
  { value: "in-school", label: "onboarding.q1.inSchool" },
  { value: "unschooling", label: "onboarding.q1.unschooling" },
  { value: "want-to-know-more", label: "onboarding.q1.wantToKnow" },
  { value: "new-way-of-learning", label: "onboarding.q1.newWay" },
];

const Q2_KEYS: { value: Reason; label: UiKey }[] = [
  { value: "curriculum", label: "onboarding.q2.curriculum" },
  { value: "community", label: "onboarding.q2.community" },
  { value: "philosophy", label: "onboarding.q2.philosophy" },
  { value: "notsure", label: "onboarding.q2.notSure" },
];

const Q3_KEYS: { value: Referral; label: UiKey }[] = [
  { value: "friend", label: "onboarding.q3.friend" },
  { value: "web-search", label: "onboarding.q3.webSearch" },
  { value: "social-media", label: "onboarding.q3.socialMedia" },
  { value: "youtube", label: "onboarding.q3.youtube" },
  { value: "other", label: "onboarding.q3.other" },
  { value: "unspecified", label: "onboarding.q3.unspecified" },
];

export default function OnboardingPage() {
  const ready = useRequireAuthPage("/");
  const { user, consumePendingReturn } = useAuth();
  const { t } = useLanguage();
  const Q1_OPTIONS = Q1_KEYS.map((o) => ({ value: o.value, label: t(o.label) }));
  const Q2_OPTIONS = Q2_KEYS.map((o) => ({ value: o.value, label: t(o.label) }));
  const Q3_OPTIONS = Q3_KEYS.map((o) => ({ value: o.value, label: t(o.label) }));
  const router = useRouter();
  const [situation, setSituation] = useState<Situation>("want-to-know-more");
  const [reason, setReason] = useState<Reason>("notsure");
  const [referral, setReferral] = useState<Referral>("unspecified");
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const [regionError, setRegionError] = useState(false);
  const keyForm = useRef<AiKeyFormHandle>(null);

  async function finish(save: boolean) {
    // The region question is required: both Continue and Skip wait for it.
    if (!region) {
      setRegionError(true);
      return;
    }
    if (!save && user) {
      setSaving(true);
      await createClient().from("profiles").update({ region }).eq("id", user.id);
      setSaving(false);
    }
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
          region,
        })
        .eq("id", user.id);
      setSaving(false);
    }

    const target = consumePendingReturn();
    // Every new member gets a welcome card on the Experience Board, tuned to
    // their Q1 answer — someone already homeschooling/unschooling is new to
    // the HUB, not to the idea, so their card is about sharing experience
    // and finding others like them, not "here's what this is." See
    // ExperienceBoardClient.tsx for the four variants.
    if (save && target === "/experience") {
      window.localStorage.setItem("aoehub.welcomeSituation", situation);
    }
    router.push(target);
  }

  if (!ready) return null;

  return (
    <>
      <p role="heading" aria-level={1} className="title" style={{ marginBottom: 4 }}>{t("onboarding.welcome")}</p>
      <p className="muted" style={{ marginBottom: 20 }}>{t("onboarding.intro")}</p>

      <p className="field-label" style={{ marginTop: 0 }}>{t("onboarding.q1")}</p>
      <ChipRow options={Q1_OPTIONS} value={situation} onChange={setSituation} />

      <p className="field-label">{t("onboarding.q2")}</p>
      <ChipRow options={Q2_OPTIONS} value={reason} onChange={setReason} />

      <p className="field-label">{t("onboarding.q3")}</p>
      <ChipRow options={Q3_OPTIONS} value={referral} onChange={setReferral} />

      <p className="field-label">
        {t("onboarding.regionQuestion")} <span className="tiny">{t("common.required")}</span>
      </p>
      <RegionPicker value={region} onChange={(r) => { setRegion(r); setRegionError(false); }} />
      <p className="tiny" style={{ marginTop: 6 }}>{t("onboarding.regionHint")}</p>
      {regionError && <p className="tiny" style={{ color: "#b5471f", marginTop: 6 }}>{t("onboarding.regionError")}</p>}

      
      <p className="field-label">{t("onboarding.aiTitle")}</p>
      <p className="tiny" style={{ marginBottom: 8 }}>{t("onboarding.aiBody")}</p>
      <AiKeyForm ref={keyForm} standalone={false} region={region} />

      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 20 }}
        disabled={saving}
        onClick={() => finish(true)}
      >
        {saving ? t("common.saving") : t("common.continue")}
      </button>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={saving} onClick={() => finish(false)}>
        {t("common.skipForNow")}
      </button>
    </>
  );
}
