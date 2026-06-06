import { redirect } from "next/navigation";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (workspaceId) redirect("/today");

  return <LoginForm />;
}
