"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { BackLink } from "@/components/ui/BackLink";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { GROUP_CREATE_MIN_POINTS, GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS, daysSince } from "@/lib/data/group-eligibility";
import type { GroupVisibility } from "@/lib/types";

function CheckItem({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <div className="check-item" style={{ opacity: met ? 1 : 0.5 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children}
    </div>
  );
}

export default function CreateGroupPage() {
  const { user } = useAuth();
  useRequireAuthPage("/groups");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<GroupVisibility>("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const accountAgeDays = daysSince(user.memberSince);
  const hasPoints = user.points >= GROUP_CREATE_MIN_POINTS;
  const hasAccountAge = accountAgeDays >= GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS;
  // The real gate is the creator_must_be_eligible_for_group() trigger in
  // schema.sql — this client-side check is just to disable the button early
  // and show the checklist; the DB is the source of truth either way. Admins
  // bypass the gate entirely there, so this must match or an admin's own
  // "Create group" button would stay disabled with no way to proceed.
  const eligible = user.isAdmin || (hasPoints && hasAccountAge);

  async function submit() {
    if (!user || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("groups").insert({
      name: name.trim(),
      description: description.trim() || null,
      visibility,
      created_by: user.id,
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push("/groups");
    router.refresh();
  }

  return (
    <>
      <BackLink href="/groups" label="Cancel" />
      <p className="title" style={{ marginBottom: 14 }}>Create a group</p>

      <div className="card" style={{ background: "var(--bg)" }}>
        <p className="tiny" style={{ marginBottom: 8, fontWeight: 500 }}>Eligibility to create a group:</p>
        <CheckItem met={hasPoints}>{GROUP_CREATE_MIN_POINTS}+ points (you have {user.points.toLocaleString()})</CheckItem>
        <CheckItem met={hasAccountAge}>Account older than {GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS} days</CheckItem>
        <CheckItem met>No unresolved reports</CheckItem>
      </div>

      <label className="field-label">Group name</label>
      <input placeholder="e.g. Only children homeschool support" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="field-label">Description</label>
      <textarea placeholder="What's this group for?" value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="field-label">Visibility</label>
      <Segmented
        options={[
          { value: "public", label: "Public" },
          { value: "private", label: "Private" },
        ]}
        value={visibility}
        onChange={setVisibility}
      />
      <p className="tiny" style={{ marginTop: 10 }}>
        Even private groups stay visible to admins for moderation — &quot;private&quot; means private from other
        members, not from the hub.
      </p>

      {error && (
        <p className="muted" style={{ color: "#b5471f", marginTop: 10 }}>
          {error}
        </p>
      )}

      <Button
        variant="primary"
        style={{ width: "100%", marginTop: 18 }}
        disabled={!eligible || !name.trim() || submitting}
        onClick={submit}
      >
        {submitting ? "Creating…" : "Create group"}
      </Button>
    </>
  );
}
