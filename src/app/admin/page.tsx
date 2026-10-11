import { requireStaff } from "@/lib/auth/staff";
import { AdminDashboardClient } from "./AdminDashboardClient";

// The old admin dashboard, cut down to the two things the new panels do not
// replace yet: the inbox of questions sent to the admins and the AI's
// knowledge base (books). Reports, people and roles live in the Creator,
// Watcher and Deacon panels. The role is re-checked on the server.
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireStaff(["creator", "watcher"]);
  return <AdminDashboardClient />;
}
