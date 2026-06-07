import { redirect } from "next/navigation";
import { InboxView } from "@/components/inbox-view";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getInboxPageData } from "@/lib/planning/view-data";

export default async function InboxPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  const data = await getInboxPageData(workspaceId);
  return <InboxView initialItems={data.items} dataUnavailable={data.dataUnavailable} />;
}
