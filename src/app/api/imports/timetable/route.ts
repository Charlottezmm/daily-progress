import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { parseTimetableCsv } from "@/lib/imports/timetable-csv";
import { readJsonBody } from "@/lib/validation/common";

const bodySchema = z.object({
  csv: z.string().min(1).max(200_000),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timetable CSV payload" }, { status: 400 });
  }

  try {
    return NextResponse.json({ preview: parseTimetableCsv(parsed.data.csv) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid timetable CSV" },
      { status: 400 },
    );
  }
}
