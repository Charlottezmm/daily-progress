import { NextResponse } from "next/server";
import { clearWorkspaceSession } from "@/lib/auth/session";

export async function POST() {
  await clearWorkspaceSession();
  return NextResponse.json({ ok: true });
}
