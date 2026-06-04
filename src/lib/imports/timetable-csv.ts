import Papa from "papaparse";
import { z } from "zod";

const rowSchema = z.object({
  title: z.string().trim().min(1),
  kind: z.enum(["course", "meeting", "unavailable", "routine", "recovery"]),
  day_of_week: z.string().trim().min(1),
  start_time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().trim().regex(/^\d{2}:\d{2}$/),
  starts_on: z.string().trim().min(1),
  ends_on: z.string().trim().min(1),
  course: z.string().optional(),
  recurrence: z.string().optional(),
  notes: z.string().optional(),
});

export type TimetableImportPreviewRow = {
  title: string;
  kind: "course" | "meeting" | "unavailable" | "routine" | "recovery";
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  startsOn: string;
  endsOn: string;
  course: string | null;
  recurrence: string | null;
  notes: string | null;
};

function optionalCell(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTimetableCsv(csv: string): TimetableImportPreviewRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }

  return parsed.data.map((raw) => {
    const row = rowSchema.parse(raw);
    return {
      title: row.title,
      kind: row.kind,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      course: optionalCell(row.course),
      recurrence: optionalCell(row.recurrence),
      notes: optionalCell(row.notes),
    };
  });
}
