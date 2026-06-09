import { and, eq } from "drizzle-orm";
import { changeLogs, courses, plans, timeBlocks } from "@/lib/db/schema";
import { parseTimetableCsv, type TimetableImportPreviewRow } from "@/lib/imports/timetable-csv";
import { ImportSaveError } from "@/lib/imports/plan-save";

type ImportDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

const weekdayNumbers = new Map([
  ["sunday", 0],
  ["sun", 0],
  ["monday", 1],
  ["mon", 1],
  ["tuesday", 2],
  ["tue", 2],
  ["wednesday", 3],
  ["wed", 3],
  ["thursday", 4],
  ["thu", 4],
  ["friday", 5],
  ["fri", 5],
  ["saturday", 6],
  ["sat", 6],
]);

function parseDateKey(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new ImportSaveError("Invalid timetable date", 400);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ImportSaveError("Invalid timetable date", 400);
  }

  return date;
}

function dateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseTimeMinutes(value: string) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new ImportSaveError("Invalid timetable time", 400);

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new ImportSaveError("Invalid timetable time", 400);
  return hours * 60 + minutes;
}

function normalizeWeekday(value: string | null) {
  if (!value) return null;
  const weekday = weekdayNumbers.get(value.trim().toLowerCase());
  if (weekday === undefined) throw new ImportSaveError("Invalid day_of_week", 400);
  return weekday;
}

function shanghaiDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00.000+08:00`);
}

function datesForRow(row: TimetableImportPreviewRow) {
  const start = parseDateKey(row.startsOn);
  const end = parseDateKey(row.endsOn);
  if (end.getTime() < start.getTime()) throw new ImportSaveError("Invalid timetable date range", 400);

  const weekday = normalizeWeekday(row.dayOfWeek);
  if (weekday === null) {
    if (row.startsOn !== row.endsOn) {
      throw new ImportSaveError("day_of_week is required for multi-day timetable ranges", 400);
    }
    return [row.startsOn];
  }

  const dates: string[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    if (cursor.getUTCDay() === weekday) dates.push(dateKey(cursor));
  }
  return dates;
}

function materializeRows(rows: TimetableImportPreviewRow[]) {
  const blocks: Array<{
    row: TimetableImportPreviewRow;
    startsAt: Date;
    endsAt: Date;
  }> = [];

  for (const row of rows) {
    const startMinutes = parseTimeMinutes(row.startTime);
    const endMinutes = parseTimeMinutes(row.endTime);
    if (endMinutes <= startMinutes) throw new ImportSaveError("end_time must be after start_time", 400);

    for (const date of datesForRow(row)) {
      blocks.push({
        row,
        startsAt: shanghaiDateTime(date, row.startTime),
        endsAt: shanghaiDateTime(date, row.endTime),
      });
    }
  }

  if (blocks.length === 0) throw new ImportSaveError("No timetable blocks to import", 400);
  return blocks;
}

async function getActivePlanId(tx: ImportDb, workspaceId: string) {
  const [plan] = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
    .limit(1);

  if (!plan) throw new ImportSaveError("No active plan", 400);
  return plan.id as string;
}

function courseNameFor(row: TimetableImportPreviewRow) {
  if (row.course) return row.course;
  if (row.kind === "course") return row.title;
  return null;
}

export async function saveTimetableImport(
  db: ImportDb,
  input: {
    workspaceId: string;
    csv: string;
  },
) {
  let preview: TimetableImportPreviewRow[];
  try {
    preview = parseTimetableCsv(input.csv);
  } catch (error) {
    throw new ImportSaveError(error instanceof Error ? error.message : "Invalid timetable CSV", 400);
  }
  const blocks = materializeRows(preview);

  return db.transaction(async (tx) => {
    const planId = await getActivePlanId(tx, input.workspaceId);
    const courseIds = new Map<string, string>();
    let coursesCreated = 0;
    let coursesReused = 0;

    for (const block of blocks) {
      const courseName = courseNameFor(block.row);
      if (!courseName || courseIds.has(courseName)) continue;

      const [existing] = await tx
        .select({ id: courses.id })
        .from(courses)
        .where(and(eq(courses.workspaceId, input.workspaceId), eq(courses.name, courseName)))
        .limit(1);

      if (existing) {
        courseIds.set(courseName, existing.id);
        coursesReused += 1;
        continue;
      }

      const [created] = await tx
        .insert(courses)
        .values({ workspaceId: input.workspaceId, name: courseName })
        .returning();
      courseIds.set(courseName, created.id);
      coursesCreated += 1;
    }

    const blockValues = blocks.map((block) => {
      const courseName = courseNameFor(block.row);
      return {
        workspaceId: input.workspaceId,
        title: block.row.title,
        kind: block.row.kind,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        recurrenceRule: block.row.recurrence,
        courseId: courseName ? courseIds.get(courseName) ?? null : null,
        movable: false,
      };
    });

    await tx.insert(timeBlocks).values(blockValues);

    await tx.insert(changeLogs).values({
      workspaceId: input.workspaceId,
      planId,
      source: "import",
      summary: "Imported timetable.csv preview",
      detailsJson: {
        format: "timetable.csv",
        rowsPreviewed: preview.length,
        blocksCreated: blockValues.length,
        coursesCreated,
        coursesReused,
        note: "Save adds new time_blocks; duplicate imports are not deduplicated.",
      },
    });

    return {
      blocksCreated: blockValues.length,
      coursesCreated,
      coursesReused,
    };
  });
}
