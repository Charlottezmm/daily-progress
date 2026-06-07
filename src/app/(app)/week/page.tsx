import { redirect } from "next/navigation";
import { WeekView } from "@/components/week-view";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getWeekPageData } from "@/lib/planning/view-data";

export default async function WeekPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const data = await getWeekPageData(workspaceId);
  return <WeekView data={data} />;
}
