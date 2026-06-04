import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { checkins, plans } from "@/lib/db/schema";
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

async function getActivePlanId(workspaceId: string) {
  const db = getDb();
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
    .limit(1);
  return plan?.id ?? null;
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

  const planId = await getActivePlanId(workspaceId);
  if (!planId) return NextResponse.json({ error: "No active plan" }, { status: 400 });

  const parsed = checkinSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-in payload" }, { status: 400 });
  }

  const db = getDb();
  const today = startOfShanghaiToday();
  await db
    .insert(checkins)
    .values({
      workspaceId,
      planId,
      date: today,
      completedText: parsed.data.completedText,
      blockerText: parsed.data.blockerText,
      nextText: parsed.data.nextText,
    })
    .onConflictDoUpdate({
      target: [checkins.workspaceId, checkins.date],
      set: {
        completedText: parsed.data.completedText,
        blockerText: parsed.data.blockerText,
        nextText: parsed.data.nextText,
        updatedAt: new Date(),
      },
    });

  const streakDays = await calculateCheckinStreak(workspaceId);
  return NextResponse.json({ ok: true, streakDays });
}
