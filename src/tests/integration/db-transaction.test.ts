import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";

const runDatabaseIntegration = process.env.RUN_DATABASE_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

describe.runIf(runDatabaseIntegration)("database driver transaction support", () => {
  it("runs a minimal transaction write against the configured DATABASE_URL driver", async () => {
    const db = getDb();
    const rollback = new Error("rollback transaction support smoke");
    const workspaceName = `__txn_smoke_${Date.now()}`;

    await expect(
      db.transaction(async (tx) => {
        const [workspace] = await tx
          .insert(workspaces)
          .values({ name: workspaceName, passwordHash: "transaction-smoke" })
          .returning();

        expect(workspace.name).toBe(workspaceName);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
