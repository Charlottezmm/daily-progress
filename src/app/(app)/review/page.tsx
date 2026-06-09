import { redirect } from "next/navigation";
import { ReviewPreview } from "@/components/reschedule-preview";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getReschedulePageData } from "@/lib/planning/view-data";

export default async function ReviewPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const data = await getReschedulePageData(workspaceId);
  return <ReviewPreview data={data} />;
}
