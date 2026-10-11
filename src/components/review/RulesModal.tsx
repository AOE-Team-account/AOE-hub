"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// The strict rules every reviewer follows (memory doc chat6, "Strict rules for
// reviewers" — a draft the Creator edits). Shown from both panels.
export function RulesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}>Rules for reviewers</Button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <p className="title">Rules for reviewers</p>
        <ol className="muted" style={{ paddingLeft: 18, margin: "8px 0" }}>
          <li>Every action needs a reason from the fixed list: delete, warn, dismiss and notice. No reason, no action.</li>
          <li>The reason sets the warning level. You cannot pick or change the level.</li>
          <li>Counts, restrictions and reports follow the fixed thresholds and cannot be skipped or forced.</li>
          <li>Only the Creator deletes accounts, undoes warnings, or changes a notice the Creator added.</li>
          <li>No self-review: you cannot act on your own posts, comments or files. Another reviewer will.</li>
          <li>Everything you do is recorded with your name and the time, and kept as evidence. Misuse can cost you the role.</li>
          <li>Deleting is never final: the Creator can restore anything.</li>
        </ol>
        <div className="row"><Button onClick={() => setOpen(false)}>Close</Button></div>
      </Modal>
    </>
  );
}
