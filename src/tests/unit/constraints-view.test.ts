import { describe, expect, it } from "vitest";
import { buildConstraintGroups } from "@/components/constraints-view";

function block(input: {
  id: string;
  title: string;
  kind?: "course" | "meeting" | "unavailable" | "routine" | "recovery";
  startsAt: string;
  endsAt: string;
}) {
  return {
    id: input.id,
    title: input.title,
    kind: input.kind ?? "routine",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    recurrenceRule: null,
    courseId: null,
    courseName: null,
    movable: false as const,
  };
}

describe("constraints view helpers", () => {
  it("folds repeated concrete time blocks into weekly summary groups", () => {
    const groups = buildConstraintGroups([
      block({
        id: "mon-hard",
        title: "学习主线·硬核",
        startsAt: "2026-06-15T05:00:00.000+08:00",
        endsAt: "2026-06-15T07:00:00.000+08:00",
      }),
      block({
        id: "tue-hard",
        title: "学习主线·硬核",
        startsAt: "2026-06-16T05:00:00.000+08:00",
        endsAt: "2026-06-16T07:00:00.000+08:00",
      }),
      block({
        id: "mon-work",
        title: "工作·程辉硬件",
        startsAt: "2026-06-15T13:00:00.000+08:00",
        endsAt: "2026-06-15T18:00:00.000+08:00",
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual(expect.objectContaining({
      title: "学习主线·硬核",
      startTime: "05:00",
      endTime: "07:00",
      weekdays: ["mon", "tue"],
      blocks: expect.arrayContaining([expect.objectContaining({ id: "mon-hard" }), expect.objectContaining({ id: "tue-hard" })]),
    }));
    expect(groups[1]).toEqual(expect.objectContaining({
      title: "工作·程辉硬件",
      weekdays: ["mon"],
      blocks: [expect.objectContaining({ id: "mon-work" })],
    }));
  });
});
