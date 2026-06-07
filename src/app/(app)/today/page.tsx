import { redirect } from "next/navigation";
import { TodayView } from "@/components/today-view";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getTodayPageData } from "@/lib/planning/view-data";

export default async function TodayPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const data = await getTodayPageData(workspaceId);
  return <TodayView data={data} />;
}
