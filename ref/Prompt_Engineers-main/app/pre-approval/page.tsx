import { AppWorkspace } from "@/components/app-workspace";
import { getDashboardData } from "@/lib/transactions/get-dashboard-data";

export default async function PreApprovalPage() {
  const dashboard = await getDashboardData();

  return <AppWorkspace dashboard={dashboard} initialManagerView="requests" />;
}
