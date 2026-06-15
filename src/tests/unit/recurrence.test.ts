import { describe, expect, it } from "vitest";
import { weekdayMaskFromRecurrence } from "@/lib/constraints/recurrence";
import { materializeTimetableRows } from "@/lib/imports/timetable-save";
import type { TimetableImportPreviewRow } from "@/lib/imports/timetable-csv";

// 2026-06-15 09:00 +08:00 是周一
const mondayStart = new Date("2026-06-15T09:00:00.000+08:00");

const MON = 1 << 1;
const TUE = 1 << 2;
const WED = 1 << 3;
const THU = 1 << 4;
const FRI = 1 << 5;
const SAT = 1 << 6;
const SUN = 1 << 0;

describe("weekdayMaskFromRecurrence", () => {
  it("returns null for empty rule (one-off)", () => {
    expect(weekdayMaskFromRecurrence(null, mondayStart)).toBeNull();
    expect(weekdayMaskFromRecurrence("", mondayStart)).toBeNull();
    expect(weekdayMaskFromRecurrence("   ", mondayStart)).toBeNull();
  });

  it("maps 每天 / daily to all seven days", () => {
    expect(weekdayMaskFromRecurrence("每天", mondayStart)).toBe(0b1111111);
    expect(weekdayMaskFromRecurrence("daily", mondayStart)).toBe(0b1111111);
  });

  it("maps 工作日 / weekdays to Mon–Fri", () => {
    const expected = MON | TUE | WED | THU | FRI;
    expect(weekdayMaskFromRecurrence("工作日", mondayStart)).toBe(expected);
    expect(weekdayMaskFromRecurrence("weekdays", mondayStart)).toBe(expected);
    expect(weekdayMaskFromRecurrence("工作日", mondayStart)).toBe(62);
  });

  it("maps 周一到周六 / mon-sat to Mon–Sat", () => {
    const expected = MON | TUE | WED | THU | FRI | SAT;
    expect(weekdayMaskFromRecurrence("周一到周六", mondayStart)).toBe(expected);
    expect(weekdayMaskFromRecurrence("mon-sat", mondayStart)).toBe(126);
  });

  it("maps 周末 / weekends to Sat + Sun", () => {
    expect(weekdayMaskFromRecurrence("周末", mondayStart)).toBe(SAT | SUN);
  });

  it("maps weekly / 每周 to the start date's weekday", () => {
    expect(weekdayMaskFromRecurrence("weekly", mondayStart)).toBe(MON);
    // 2026-06-17 是周三
    const wedStart = new Date("2026-06-17T09:00:00.000+08:00");
    expect(weekdayMaskFromRecurrence("每周", wedStart)).toBe(WED);
  });

  it("parses explicit weekday lists (en + zh)", () => {
    expect(weekdayMaskFromRecurrence("mon,wed,fri", mondayStart)).toBe(MON | WED | FRI);
    expect(weekdayMaskFromRecurrence("周一 周三 周五", mondayStart)).toBe(MON | WED | FRI);
  });

  it("falls back to weekly-on-start-day for unrecognized non-empty rules", () => {
    expect(weekdayMaskFromRecurrence("每隔一天?", mondayStart)).toBe(MON);
  });
});

describe("materializeTimetableRows with recurrence (no day_of_week)", () => {
  const base = {
    title: "工作·硬件",
    kind: "routine" as const,
    dayOfWeek: null,
    startTime: "13:00",
    endTime: "18:00",
    startsOn: "2026-06-15",
    endsOn: "2026-08-31",
    course: null,
    notes: null,
  };

  it("creates a single multi-day block from a recurrence rule", () => {
    const rows: TimetableImportPreviewRow[] = [{ ...base, recurrence: "工作日" }];
    const blocks = materializeTimetableRows(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].recurrenceWeekdayMask).toBe(62);
    expect(blocks[0].startsAt).toEqual(new Date("2026-06-15T13:00:00.000+08:00"));
    expect(blocks[0].endsAt).toEqual(new Date("2026-08-31T18:00:00.000+08:00"));
  });

  it("still requires day_of_week or recurrence for multi-day ranges", () => {
    const rows: TimetableImportPreviewRow[] = [{ ...base, recurrence: null }];
    expect(() => materializeTimetableRows(rows)).toThrow(/day_of_week or recurrence/);
  });

  it("keeps single-weekday behavior when day_of_week is provided", () => {
    const rows: TimetableImportPreviewRow[] = [
      { ...base, dayOfWeek: "mon", recurrence: "weekly" },
    ];
    const blocks = materializeTimetableRows(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].recurrenceWeekdayMask).toBe(1 << 1);
  });
});
