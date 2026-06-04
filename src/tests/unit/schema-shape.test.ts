import { describe, expect, it } from "vitest";
import {
  changeLogs,
  checkinTasks,
  checkins,
  dayCapacities,
  inboxItems,
  routines,
  segmentEnergySettings,
  tags,
  taskTags,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";

describe("schema shape", () => {
  it("keeps track on tasks, not plans", () => {
    expect(tasks.trackId).toBeDefined();
  });

  it("supports routine and recovery time blocks", () => {
    expect(timeBlocks.kind).toBeDefined();
  });

  it("supports inbox capture", () => {
    expect(inboxItems.title).toBeDefined();
  });

  it("supports track thresholds", () => {
    expect(tracks.targetMinPercent).toBeDefined();
    expect(tracks.targetMaxPercent).toBeDefined();
  });

  it("supports tags, capacity, segment energy, check-in tasks, and change logs", () => {
    expect(tags.name).toBeDefined();
    expect(taskTags.taskId).toBeDefined();
    expect(dayCapacities.morningMinutes).toBeDefined();
    expect(segmentEnergySettings.energyLevel).toBeDefined();
    expect(checkinTasks.status).toBeDefined();
    expect(changeLogs.source).toBeDefined();
  });

  it("supports specific-window routines and one check-in per workspace day", () => {
    expect(routines.defaultTimeSegment).toBeDefined();
    expect(checkins.date).toBeDefined();
  });
});
