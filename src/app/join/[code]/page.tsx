import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";

export default async function JoinPage({
  params,
}: {
  params: { code: string };
}) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (workspaceId) redirect("/today");

  return (
    <LoginForm
      nextPath="/today"
      initialMode="create"
      initialInviteCode={decodeURIComponent(params.code)}
      inviteCodeLocked
    />
  );
}
