import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  neonHttpDrizzleCalls: 0,
  neonServerlessDrizzleCalls: 0,
  nodePostgresDrizzleCalls: 0,
  neonPoolConfigs: [] as Array<Record<string, unknown>>,
  pgPoolConfigs: [] as Array<Record<string, unknown>>,
  neonConfig: {} as { webSocketConstructor?: unknown },
}));

vi.mock("@neondatabase/serverless", () => ({
  neonConfig: mockState.neonConfig,
  neon: vi.fn(() => ({})),
  Pool: class MockNeonPool {
    constructor(config: Record<string, unknown>) {
      mockState.neonPoolConfigs.push(config);
    }
  },
}));

vi.mock("drizzle-orm/neon-http", () => ({
  drizzle: vi.fn(() => {
    mockState.neonHttpDrizzleCalls += 1;
    return { driver: "neon-http" };
  }),
}));

vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn(() => {
    mockState.neonServerlessDrizzleCalls += 1;
    return { driver: "neon-serverless" };
  }),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => {
    mockState.nodePostgresDrizzleCalls += 1;
    return { driver: "node-postgres" };
  }),
}));

vi.mock("pg", () => ({
  Pool: class MockPgPool {
    constructor(config: Record<string, unknown>) {
      mockState.pgPoolConfigs.push(config);
    }
  },
}));

describe("database client", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalWsNoBufferUtil = process.env.WS_NO_BUFFER_UTIL;

  beforeEach(() => {
    vi.resetModules();
    mockState.neonHttpDrizzleCalls = 0;
    mockState.neonServerlessDrizzleCalls = 0;
    mockState.nodePostgresDrizzleCalls = 0;
    mockState.neonPoolConfigs = [];
    mockState.pgPoolConfigs = [];
    delete mockState.neonConfig.webSocketConstructor;
    delete process.env.WS_NO_BUFFER_UTIL;
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.WS_NO_BUFFER_UTIL = originalWsNoBufferUtil;
  });

  it("uses neon-serverless for non-local database URLs so transaction writes are supported", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@example.neon.tech/pawplan";

    const { getDb } = await import("@/lib/db/client");
    const db = getDb();

    expect(db).toEqual({ driver: "neon-serverless" });
    expect(mockState.neonPoolConfigs).toEqual([{ connectionString: process.env.DATABASE_URL }]);
    expect(mockState.neonServerlessDrizzleCalls).toBe(1);
    expect(mockState.neonHttpDrizzleCalls).toBe(0);
    expect(mockState.nodePostgresDrizzleCalls).toBe(0);
    expect(process.env.WS_NO_BUFFER_UTIL).toBe("1");
    expect(typeof mockState.neonConfig.webSocketConstructor).toBe("function");
  });

  it("keeps node-postgres for local database URLs", async () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/pawplan";

    const { getDb } = await import("@/lib/db/client");
    const db = getDb();

    expect(db).toEqual({ driver: "node-postgres" });
    expect(mockState.pgPoolConfigs).toEqual([{ connectionString: process.env.DATABASE_URL }]);
    expect(mockState.nodePostgresDrizzleCalls).toBe(1);
    expect(mockState.neonServerlessDrizzleCalls).toBe(0);
    expect(mockState.neonHttpDrizzleCalls).toBe(0);
  });
});
