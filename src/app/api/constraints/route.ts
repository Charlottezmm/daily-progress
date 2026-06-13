import { NextResponse } from "next/server";
import { constraintsPatchSchema, constraintsPostSchema } from "@/lib/constraints/schema";
import {
  ConstraintsServiceError,
  deleteTimeBlock,
  getConstraints,
  upsertTimeBlock,
} from "@/lib/constraints/service";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { readJsonBody } from "@/lib/validation/common";

function serviceError(error: unknown) {
  if (error instanceof ConstraintsServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Failed to update constraints" }, { status: 500 });
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  return NextResponse.json(await getConstraints(db, workspaceId));
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = constraintsPostSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid constraints action" }, { status: 400 });

  const db = getDb();
  try {
    return NextResponse.json(await upsertTimeBlock(db, workspaceId, parsed.data.timeBlock));
  } catch (error) {
    return serviceError(error);
  }
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = constraintsPatchSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid constraints action" }, { status: 400 });

  const db = getDb();
  try {
    return NextResponse.json(await deleteTimeBlock(db, workspaceId, parsed.data.id));
  } catch (error) {
    return serviceError(error);
  }
}
