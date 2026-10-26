"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While a file is still being scanned, quietly reload the page every few seconds (for up to ten minutes). */
export function ScanWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    let rounds = 0;
    const timer = setInterval(() => {
      rounds++;
      router.refresh();
      if (rounds >= 60) clearInterval(timer);
    }, 10_000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
