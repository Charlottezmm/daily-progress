export function adminWorkspaceIds() {
  const value = process.env.PAWPLAN_ADMIN_WORKSPACE_IDS ?? process.env.ADMIN_WORKSPACE_IDS ?? "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isAdminWorkspaceId(workspaceId: string | null) {
  if (!workspaceId) return false;
  return adminWorkspaceIds().includes(workspaceId);
}
