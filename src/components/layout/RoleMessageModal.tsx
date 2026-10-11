"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface RoleMessage {
  id: string;
  body: string;
}

// An unmissable on-screen message when the Creator gives or removes a role.
// Messages that arrived while the person was signed out are shown one after
// another the next time they sign in; each is marked read when dismissed.
export function RoleMessageModal() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<RoleMessage[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("notifications")
        .select("id, body")
        .in("kind", ["role-granted", "role-revoked"])
        .eq("read", false)
        .order("created_at", { ascending: true });
      if (!cancelled) setQueue((data ?? []) as RoleMessage[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = queue[0];
  async function dismiss() {
    if (!current) return;
    await createClient().from("notifications").update({ read: true }).eq("id", current.id);
    setQueue((q) => q.slice(1));
  }

  return (
    <Modal open={Boolean(current)} onClose={dismiss}>
      <p className="title">A message for you</p>
      <p className="muted">{current?.body}</p>
      <div className="row"><Button variant="primary" onClick={dismiss}>Got it</Button></div>
    </Modal>
  );
}
