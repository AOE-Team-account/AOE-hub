"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBytes } from "@/lib/format";

// A warning at the very top of the Creator panel when the main storage has passed 8 GB.
export function StorageBanner() {
  const { t } = useLanguage();
  const [bytes, setBytes] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/creator/storage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.state && d.state.bytes >= 8e9) setBytes(d.state.bytes); })
      .catch(() => undefined);
  }, []);
  if (bytes === null) return null;
  return (
    <p className="policy-note" style={{ borderLeftColor: bytes >= 10e9 ? "#b5471f" : "#c98a1a", marginBottom: 12 }}>
      <strong>{t("creator.storage.banner", { used: formatBytes(bytes) })}</strong>
    </p>
  );
}
