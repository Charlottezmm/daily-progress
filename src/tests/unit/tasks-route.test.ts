import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getWorkspaceIdFromSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/planning/service", () => {
  class PlanningServiceError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  }

  return {
    PlanningServiceError,
    updateTaskSchedule: vi.fn(),
    updateTaskStatus: vi.fn(),
  };
});

const taskId = "11111111-1111-4111-8111-111111111111";

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tasks", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("tasks route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires a workspace session for PATCH", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/tasks/route");

    const response = await PATCH(patchRequest({ id: taskId, status: "done" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("rejects PATCH without a status or schedule field before opening the database", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    const { PATCH } = await import("@/app/api/tasks/route");

    const response = await PATCH(patchRequest({ id: taskId }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid task update" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("updates task status through the status service", async () => {
    const task = { id: taskId, status: "done" };
    const db = { id: "db" };
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { updateTaskSchedule, updateTaskStatus } = await import("@/lib/planning/service");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(updateTaskStatus).mockResolvedValue(task);
    const { PATCH } = await import("@/app/api/tasks/route");

    const response = await PATCH(patchRequest({ id: taskId, status: "done" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task });
    expect(updateTaskStatus).toHaveBeenCalledWith(db, {
      workspaceId: "workspace-1",
      taskId,
      status: "done",
      source: "manual",
    });
    expect(updateTaskSchedule).not.toHaveBeenCalled();
  });

  it("updates task schedule through the schedule service", async () => {
    const task = { id: taskId, date: "2026-06-17", daySegment: "afternoon" };
    const db = { id: "db" };
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { updateTaskSchedule, updateTaskStatus } = await import("@/lib/planning/service");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(updateTaskSchedule).mockResolvedValue(task);
    const { PATCH } = await import("@/app/api/tasks/route");

    const response = await PATCH(patchRequest({ id: taskId, date: "2026-06-17", daySegment: "afternoon" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task });
    expect(updateTaskSchedule).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workspaceId: "workspace-1",
        taskId,
        date: "2026-06-17",
        daySegment: "afternoon",
        source: "manual",
      }),
    );
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });

  it("keeps status when status and schedule are updated together", async () => {
    const task = { id: taskId, status: "done", date: "2026-06-17", daySegment: "evening" };
    const db = { id: "db" };
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { updateTaskSchedule, updateTaskStatus } = await import("@/lib/planning/service");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(updateTaskSchedule).mockResolvedValue(task);
    const { PATCH } = await import("@/app/api/tasks/route");

    const response = await PATCH(
      patchRequest({ id: taskId, status: "done", date: "2026-06-17", daySegment: "evening" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ task });
    expect(updateTaskSchedule).toHaveBeenCalledWith(db, {
      workspaceId: "workspace-1",
      taskId,
      status: "done",
      date: "2026-06-17",
      daySegment: "evening",
      source: "manual",
    });
    expect(updateTaskStatus).not.toHaveBeenCalled();
  });
});
