"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useRequireAuthPage } from "@/contexts/AuthContext";
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
  const [visibility, setVisibility] = useState<GroupVisibility>("public");

  if (!user) return null;

  const accountAgeDays = daysSince(user.memberSince);
  const hasPoints = user.points >= GROUP_CREATE_MIN_POINTS;
  const hasAccountAge = accountAgeDays >= GROUP_CREATE_MIN_ACCOUNT_AGE_DAYS;
  const eligible = hasPoints && hasAccountAge; // no-unresolved-reports check needs real report data (Phase 2)

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
      <input placeholder="e.g. Only children homeschool support" />
      <label className="field-label">Description</label>
      <textarea placeholder="What's this group for?" />
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

      <Button variant="primary" style={{ width: "100%", marginTop: 18 }} disabled={!eligible} onClick={() => router.push("/groups")}>
        Create group
      </Button>
    </>
  );
}
