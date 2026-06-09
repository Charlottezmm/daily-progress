import { and, desc, eq } from "drizzle-orm";
import { changeLogs, planVersions, plans, projects } from "@/lib/db/schema";
import { parsePlanMarkdown, type PlanImportPreview } from "@/lib/imports/plan-markdown";

type ImportDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export class ImportSaveError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildPlanSnapshot(baseSnapshot: unknown, preview: PlanImportPreview) {
  const snapshot = isRecord(baseSnapshot) ? baseSnapshot : {};
  return {
    ...snapshot,
    importSummary: {
      type: "plan.md",
      importedAt: new Date().toISOString(),
      goal: preview.goal,
      projectCount: preview.projects.length,
      constraintCount: preview.constraints.length,
      projects: preview.projects,
      constraints: preview.constraints,
    },
  };
}

async function requireActivePlan(tx: ImportDb, workspaceId: string) {
  const [plan] = await tx
    .select({ id: plans.id, baselineSnapshot: plans.baselineSnapshot })
    .from(plans)
    .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
    .limit(1);

  if (!plan) throw new ImportSaveError("No active plan", 400);
  return plan as { id: string; baselineSnapshot: unknown };
}

async function upsertPreviewProjects(tx: ImportDb, workspaceId: string, preview: PlanImportPreview) {
  let created = 0;
  let reused = 0;

  for (const project of preview.projects) {
    const [existing] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.name, project.name)))
      .limit(1);

    if (existing) {
      reused += 1;
      continue;
    }

    await tx.insert(projects).values({
      workspaceId,
      name: project.name,
    });
    created += 1;
  }

  return { created, reused };
}

export async function savePlanImport(
  db: ImportDb,
  input: {
    workspaceId: string;
    markdown: string;
  },
) {
  const preview = parsePlanMarkdown(input.markdown);

  return db.transaction(async (tx) => {
    const plan = await requireActivePlan(tx, input.workspaceId);
    const projectResult = await upsertPreviewProjects(tx, input.workspaceId, preview);
    const nextSnapshot = buildPlanSnapshot(plan.baselineSnapshot, preview);

    const [latestVersion] = await tx
      .select({ versionNumber: planVersions.versionNumber })
      .from(planVersions)
      .where(and(eq(planVersions.workspaceId, input.workspaceId), eq(planVersions.planId, plan.id)))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);

    const [version] = await tx
      .insert(planVersions)
      .values({
        workspaceId: input.workspaceId,
        planId: plan.id,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        snapshot: nextSnapshot,
        source: "manual_edit",
      })
      .returning();

    await tx
      .update(plans)
      .set({
        baselineSnapshot: nextSnapshot,
        currentVersionId: version.id,
        updatedAt: new Date(),
      })
      .where(and(eq(plans.id, plan.id), eq(plans.workspaceId, input.workspaceId)));

    await tx.insert(changeLogs).values({
      workspaceId: input.workspaceId,
      planId: plan.id,
      source: "import",
      summary: "Imported plan.md preview",
      detailsJson: {
        format: "plan.md",
        preview,
        projectsCreated: projectResult.created,
        projectsReused: projectResult.reused,
        versionId: version.id,
      },
    });

    return {
      planId: plan.id,
      versionId: version.id as string,
      projectsCreated: projectResult.created,
      projectsReused: projectResult.reused,
    };
  });
}
