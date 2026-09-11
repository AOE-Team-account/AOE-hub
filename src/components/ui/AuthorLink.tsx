"use client";

import Link from "next/link";

export function AuthorLink({ userId, name }: { userId: string; name: string }) {
  return (
    <Link href={`/u/${userId}`} className="author-link" onClick={(e) => e.stopPropagation()}>
      {name}
    </Link>
  );
}
