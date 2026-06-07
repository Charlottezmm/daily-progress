import { redirect } from "next/navigation";
import { ReschedulePreview } from "@/components/reschedule-preview";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getReschedulePageData } from "@/lib/planning/view-data";

export default async function ReschedulePage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const data = await getReschedulePageData(workspaceId);
  return <ReschedulePreview data={data} />;
}
