"use client";

import { useRouter } from "next/navigation";

export function BackLink({ href, label }: { href?: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="back-link"
      onClick={() => (href ? router.push(href) : router.back())}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>{" "}
      {label}
    </button>
  );
}
