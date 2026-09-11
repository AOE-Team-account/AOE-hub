"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/** A `.card` that navigates on click, without wrapping it in an <a> —
 *  needed because cards contain their own interactive children (author
 *  links, report buttons) that call stopPropagation() on click; nesting
 *  those inside a real <Link> would mean nested <a> tags. */
export function ClickableCard({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <div
      className={`card ${className}`.trim()}
      style={{ cursor: "pointer" }}
      onClick={() => router.push(href)}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
    >
      {children}
    </div>
  );
}
