"use client";

import { ErrorPanel } from "@/components/ui/ErrorPanel";

// Shown when a page crashes. Nothing about the error is displayed to the visitor.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel kind="error" onRetry={reset} />;
}
