const defaultPlanDays = 30;

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildDefaultPlanValues(workspaceId: string, now = new Date()) {
  const startDate = new Date(now);
  const endDate = addDays(startDate, defaultPlanDays);
  const snapshot = {
    version: 1,
    source: "starter",
    goal: null,
    projects: [],
    constraints: [],
  };

  return {
    plan: {
      workspaceId,
      title: "Starter Plan",
      startDate,
      endDate,
      status: "active" as const,
      baselineSnapshot: snapshot,
    },
    version: {
      workspaceId,
      versionNumber: 1,
      snapshot,
      source: "baseline" as const,
    },
    changeLog: {
      workspaceId,
      source: "import" as const,
      summary: "Created starter baseline plan",
      detailsJson: { planTitle: "Starter Plan" },
    },
  };
}
