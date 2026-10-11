"use client";

import Link from "next/link";
import { RoleBadges } from "./RoleBadges";

export function AuthorLink({ userId, name, badges }: { userId: string; name: string; badges?: string[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
      <Link href={`/u/${userId}`} className="author-link" onClick={(e) => e.stopPropagation()}>
        {name}
      </Link>
      <RoleBadges roles={badges} />
    </span>
  );
}
