"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import type { ScanStatus } from "@/lib/types";

export function DownloadButton({ assetId, scanStatus }: { assetId: string; scanStatus: ScanStatus }) {
  const { requireAuth } = useAuth();

  if (scanStatus !== "clean") {
    return (
      <Button variant="primary" size="small" disabled title="Still being checked for malware">
        {scanStatus === "flagged" ? "Unavailable" : "Scanning…"}
      </Button>
    );
  }

  function handleClick() {
    if (!requireAuth()) return;
    // A real browser navigation, not a Next.js page — this route is a
    // Route Handler that 307-redirects to a signed storage URL, which
    // router.push() (client-side app-route transitions only) can't do.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/download/${assetId}`;
  }

  return (
    <Button variant="primary" size="small" onClick={handleClick}>
      Download
    </Button>
  );
}

export function RemixButton() {
  const { requireAuth } = useAuth();
  return (
    <Button style={{ width: "100%", marginTop: 12 }} onClick={requireAuth}>
      Remix this post
    </Button>
  );
}
