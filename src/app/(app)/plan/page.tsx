import { redirect } from "next/navigation";
import { PlanView } from "@/components/plan-view";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getMonthPlanData, getTodayPageData, getWeekPageData } from "@/lib/planning/view-data";

export default async function PlanPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const [today, week, month] = await Promise.all([
    getTodayPageData(workspaceId),
    getWeekPageData(workspaceId),
    getMonthPlanData(workspaceId),
  ]);
  return <PlanView today={today} week={week} month={month} />;
}
