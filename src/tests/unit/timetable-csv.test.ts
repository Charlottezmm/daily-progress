import { describe, expect, it } from "vitest";
import { parseTimetableCsv } from "@/lib/imports/timetable-csv";

describe("timetable csv parser", () => {
  it("extracts fixed weekly blocks with camelCase fields", () => {
    const result = parseTimetableCsv(`title,kind,day_of_week,start_time,end_time,starts_on,ends_on,course,recurrence,notes
Deep Learning Lecture,course,Monday,09:00,11:00,2026-09-01,2026-12-20,Deep Learning,weekly,Room 204
Office Hours,meeting,Tuesday,14:00,15:00,2026-09-01,2026-12-20,,weekly,
`);

    expect(result).toEqual([
      {
        title: "Deep Learning Lecture",
        kind: "course",
        dayOfWeek: "Monday",
        startTime: "09:00",
        endTime: "11:00",
        startsOn: "2026-09-01",
        endsOn: "2026-12-20",
        course: "Deep Learning",
        recurrence: "weekly",
        notes: "Room 204",
      },
      {
        title: "Office Hours",
        kind: "meeting",
        dayOfWeek: "Tuesday",
        startTime: "14:00",
        endTime: "15:00",
        startsOn: "2026-09-01",
        endsOn: "2026-12-20",
        course: null,
        recurrence: "weekly",
        notes: null,
      },
    ]);
  });

  it("rejects unsupported timetable kinds", () => {
    expect(() =>
      parseTimetableCsv(`title,kind,day_of_week,start_time,end_time,starts_on,ends_on,course,recurrence,notes
Errand,personal,Monday,09:00,10:00,2026-09-01,2026-12-20,,weekly,
`),
    ).toThrow();
  });
});
