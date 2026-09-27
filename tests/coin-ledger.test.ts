// The coin history must explain every coin: its lines always add up to the balance.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { addMember, addTask, rulesFrom, setNow, tick, useTempDb } from "./helpers";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/push", () => ({ sendToMember: async () => 0 }));
vi.mock("@/lib/auth", async (real) => ({
  ...(await real<typeof import("@/lib/auth")>()),
  requireAdmin: async () => ({ id: 1, name: "Asha", is_admin: 1, lang: "en" }),
}));

let M: number, N: number;

async function ach(id: number) {
  vi.resetModules();
  return (await import("@/lib/stats")).achievementsFor(id);
}
const sum = (a: { ledger: { amount: number }[] }) => a.ledger.reduce((n, e) => n + e.amount, 0);

beforeAll(async () => {
  useTempDb();
  setNow("2026-09-28", "12:00");
  await addMember("Asha", { admin: true });
  M = await addMember("Vikash");
  N = await addMember("Neha");
  const pill = await addTask(M, { kind: "supplement", start: "2026-09-28", anyTime: true, coins: 2 });
  await addTask(M, { start: "2026-09-28", anyTime: true });
  await tick(pill, M, "2026-09-28");
  await addTask(N, { start: "2026-09-28", anyTime: true });
});

describe("coin history", () => {
  it("explains 22 coins as 2 for the tick plus 20 for the First Step badge", async () => {
    const a = await ach(M);
    expect(a.coins).toBe(22);
    expect(a.ledger.map((e) => [e.kind, e.badge ?? null, e.amount]).sort()).toEqual([
      ["badge", "first_step", 20],
      ["tasks", null, 2],
    ]);
    expect(sum(a)).toBe(a.coins);
  });

  it("pays each badge what the admin set for it", async () => {
    await rulesFrom("2026-09-28", { badge_first_step: 3 });
    const a = await ach(M);
    expect(a.ledger.find((e) => e.kind === "badge")!.amount).toBe(3);
    expect(a.coins).toBe(5);
    expect(sum(a)).toBe(a.coins);
  });

  it("gift coins go to everyone picked, with the reason in their history", async () => {
    const { giftCoins } = await import("@/app/actions");
    const fd = new FormData();
    for (const id of [M, N]) fd.append("member_ids", String(id));
    fd.set("amount", "10");
    fd.set("reason", "Cooked dinner");
    expect((await giftCoins(undefined, fd))?.message).toBe("Gave 10 coins to Vikash and Neha.");
    for (const id of [M, N]) {
      const a = await ach(id);
      expect(a.ledger).toContainEqual(expect.objectContaining({ kind: "adjust", amount: 10, text: "🎁 Cooked dinner" }));
      expect(sum(a)).toBe(a.coins);
    }
    const bad = new FormData();
    bad.append("member_ids", String(M));
    bad.set("amount", "10");
    bad.set("reason", "");
    expect((await giftCoins(undefined, bad))?.error).toMatch(/reason/);
  });
});
