import { redirect } from "next/navigation";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";

export default async function HomePage() {
  const workspaceId = await getWorkspaceIdFromSession();
  redirect(workspaceId ? "/today" : "/login");
}
