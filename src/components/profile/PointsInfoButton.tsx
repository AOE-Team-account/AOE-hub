"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { POINTS } from "@/lib/points";

export function PointsInfoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn small" style={{ marginBottom: 16 }} onClick={() => setOpen(true)}>
        ⓘ How points work
      </button>
      <Modal open={open} onClose={() => setOpen(false)}>
        <p className="title">How points work</p>
        <p className="muted" style={{ marginBottom: 8 }}>Points come from real activity on the File Board and Experience Board:</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {POINTS.VIEW} point per view (counted once per person per day)</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {POINTS.DOWNLOAD} points per download</p>
        <p className="muted" style={{ marginBottom: 4 }}>• {POINTS.COMMENT_RECEIVED} points per question or comment someone leaves on your post</p>
        <p className="muted" style={{ marginBottom: 10 }}>• {POINTS.REMIX} points when someone remixes your file</p>
        <p className="tiny">
          Search ranking uses a compressed version of these numbers, so one huge hit doesn&apos;t bury everything
          else — but your profile total is always a simple, honest sum.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary" onClick={() => setOpen(false)}>Got it</button>
        </div>
      </Modal>
    </>
  );
}
