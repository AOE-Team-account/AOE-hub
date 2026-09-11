"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";

export function DownloadButton() {
  const { requireAuth } = useAuth();
  return (
    <Button variant="primary" size="small" onClick={requireAuth}>
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
