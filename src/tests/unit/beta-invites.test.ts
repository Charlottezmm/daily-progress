import { describe, expect, it, vi } from "vitest";
import { hashInviteCode, validateAndRedeemInviteCode } from "@/lib/beta/invites";

const now = new Date("2026-06-13T08:00:00.000Z");

function invite(overrides: Partial<{
  id: string;
  codeHash: string;
  label: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  disabledAt: Date | null;
}> = {}) {
  return {
    id: "invite-1",
    codeHash: hashInviteCode("BETA-123"),
    label: "Founding beta",
    maxRedemptions: 3,
    redemptionCount: 0,
    expiresAt: null,
    disabledAt: null,
    createdAt: now,
    ...overrides,
  };
}

function mockInviteDb(row: ReturnType<typeof invite> | undefined, redeemed = true) {
  const limit = vi.fn().mockResolvedValue(row ? [row] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const returning = vi.fn().mockResolvedValue(row && redeemed ? [{ ...row, redemptionCount: row.redemptionCount + 1 }] : []);
  const updateWhere = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  return {
    db: { select, update },
    calls: { select, from, where, limit, update, set, updateWhere, returning },
  };
}

describe("beta invite validation", () => {
  it("hashes equivalent invite code input consistently without returning the raw code", async () => {
    const row = invite();
    const { db, calls } = mockInviteDb(row);

    const result = await validateAndRedeemInviteCode(db as never, "  beta-123  ", now);

    expect(result).toEqual({ ok: true, inviteCodeId: "invite-1" });
    expect(calls.returning).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("beta-123");
    expect(row.codeHash).toBe(hashInviteCode("BETA-123"));
    expect(row.codeHash).toBe(hashInviteCode("  beta-123  "));
  });

  it("rejects expired invite codes", async () => {
    const { db, calls } = mockInviteDb(invite({ expiresAt: new Date("2026-06-13T07:59:59.000Z") }));

    const result = await validateAndRedeemInviteCode(db as never, "BETA-123", now);

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("rejects disabled invite codes", async () => {
    const { db, calls } = mockInviteDb(invite({ disabledAt: new Date("2026-06-12T00:00:00.000Z") }));

    const result = await validateAndRedeemInviteCode(db as never, "BETA-123", now);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("rejects exhausted invite codes", async () => {
    const { db, calls } = mockInviteDb(invite({ maxRedemptions: 2, redemptionCount: 2 }));

    const result = await validateAndRedeemInviteCode(db as never, "BETA-123", now);

    expect(result).toEqual({ ok: false, reason: "exhausted" });
    expect(calls.update).not.toHaveBeenCalled();
  });

  it("treats a raced redemption update as exhausted", async () => {
    const { db } = mockInviteDb(invite({ maxRedemptions: 1, redemptionCount: 0 }), false);

    const result = await validateAndRedeemInviteCode(db as never, "BETA-123", now);

    expect(result).toEqual({ ok: false, reason: "exhausted" });
  });
});
