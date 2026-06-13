import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DbClient =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzleNodePostgres<typeof schema>>;

let cachedDb: DbClient | null = null;
let cachedPool: Pool | null = null;

function isLocalDatabaseUrl(url: string) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export function getDb() {
  if (cachedDb) return cachedDb;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (isLocalDatabaseUrl(databaseUrl)) {
    cachedPool = new Pool({ connectionString: databaseUrl });
    cachedDb = drizzleNodePostgres(cachedPool, { schema });
    return cachedDb;
  }

  const sql = neon(databaseUrl);
  cachedDb = drizzleNeon(sql, { schema });
  return cachedDb;
}
