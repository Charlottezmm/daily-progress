import { redirect } from "next/navigation";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
