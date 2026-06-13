import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const ws = (() => {
  process.env.WS_NO_BUFFER_UTIL ??= "1";
  return require("ws") as typeof import("ws");
})();

type DbClient =
  | ReturnType<typeof drizzleNeonServerless<typeof schema>>
  | ReturnType<typeof drizzleNodePostgres<typeof schema>>;

let cachedDb: DbClient | null = null;
let cachedPool: Pool | NeonPool | null = null;

neonConfig.webSocketConstructor = ws;

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

  cachedPool = new NeonPool({ connectionString: databaseUrl });
  cachedDb = drizzleNeonServerless(cachedPool, { schema });
  return cachedDb;
}
