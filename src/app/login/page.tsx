import { redirect } from "next/navigation";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { safeRelativeNextPath } from "@/lib/auth/next-url";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string | string[] };
}) {
  const nextPath = safeRelativeNextPath(searchParams?.next);
  const workspaceId = await getWorkspaceIdFromSession();
  if (workspaceId) redirect(nextPath);

  return <LoginForm nextPath={nextPath} />;
}
