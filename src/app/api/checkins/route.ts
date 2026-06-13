import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { checkins } from "@/lib/db/schema";
import { createDailyCheckin, PlanningServiceError } from "@/lib/planning/service";
import { readJsonBody } from "@/lib/validation/common";

const checkinSchema = z.object({
  completedText: z.string().max(1000).default(""),
  blockerText: z.string().max(1000).default(""),
  nextText: z.string().max(1000).default(""),
});

const shanghaiTimeZone = "Asia/Shanghai";

function shanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: shanghaiTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function startOfShanghaiToday() {
  const { year, month, day } = shanghaiDateParts(new Date());
  return new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
}

function toDateKey(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function calculateCheckinStreak(workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select({ date: checkins.date })
    .from(checkins)
    .where(eq(checkins.workspaceId, workspaceId))
    .orderBy(desc(checkins.date));

  const checkedDates = new Set(rows.map((row) => toDateKey(row.date)));
  let cursor = startOfShanghaiToday();
  let streak = 0;

  while (checkedDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = checkinSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-in payload" }, { status: 400 });
  }

  const db = getDb();
  try {
    await createDailyCheckin(db, {
      workspaceId,
      completedText: parsed.data.completedText,
      blockerText: parsed.data.blockerText,
      nextText: parsed.data.nextText,
      source: "manual",
    });
  } catch (error) {
    if (error instanceof PlanningServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to create check-in" }, { status: 500 });
  }

  const streakDays = await calculateCheckinStreak(workspaceId);
  return NextResponse.json({ ok: true, streakDays });
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = startOfShanghaiToday();
  const db = getDb();
  const [checkin] = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.workspaceId, workspaceId), eq(checkins.date, today)))
    .limit(1);

  if (!checkin) {
    return NextResponse.json({ checkin: null, streakDays: await calculateCheckinStreak(workspaceId) });
  }

  return NextResponse.json({
    checkin: {
      completedText: checkin.completedText,
      blockerText: checkin.blockerText,
      nextText: checkin.nextText,
    },
    streakDays: await calculateCheckinStreak(workspaceId),
  });
}
