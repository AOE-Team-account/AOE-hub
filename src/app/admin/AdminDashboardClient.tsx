"use client";

import Link from "next/link";
import { AdminAssistantPanel } from "./AdminAssistantPanel";

export function AdminDashboardClient() {
  return (
    <>
      <p className="title" style={{ marginBottom: 4 }}>Admin tools</p>
      <p className="tiny" style={{ marginBottom: 14 }}>
        Questions people sent to the admins, and the books the AI learns from. Reports, people and roles are now in your
        panel: <Link href="/profile" style={{ color: "var(--accent)" }}>open it from your profile</Link>.
      </p>
      <AdminAssistantPanel />
    </>
  );
}
