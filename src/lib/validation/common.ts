import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const nonEmptyStringSchema = z.string().trim().min(1);

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
