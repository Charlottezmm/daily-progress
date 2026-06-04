import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const nonEmptyStringSchema = z.string().trim().min(1);
