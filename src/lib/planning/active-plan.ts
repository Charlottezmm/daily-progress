import { and, eq } from "drizzle-orm";
import { plans } from "@/lib/db/schema";

type PlanningDb = {
  select: (...args: any[]) => any;
};

export async function getActivePlanId(db: PlanningDb, workspaceId: string) {
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
    .limit(1);

  return plan?.id ?? null;
}
