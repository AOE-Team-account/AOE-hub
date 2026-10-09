import { listOpenReports } from "@/lib/data/admin";
import { AdminDashboardClient } from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const reports = await listOpenReports();
  return <AdminDashboardClient reports={reports} />;
}
