import { listOpenReports, listReportedGroups } from "@/lib/data/admin";
import { AdminDashboardClient } from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const [reports, reportedGroups] = await Promise.all([listOpenReports(), listReportedGroups()]);
  return <AdminDashboardClient reports={reports} reportedGroups={reportedGroups} />;
}
