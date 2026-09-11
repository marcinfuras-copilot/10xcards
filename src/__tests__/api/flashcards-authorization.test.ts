import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedTwoUsers, type SeededUsers } from "../setup/seed-users";

/**
 * Cross-user (IDOR) authorization coverage for Risk #1 in context/foundation/test-plan.md.
 *
 * Each checkpoint runs the exact query pattern the corresponding route executes,
 * using userB's signed-in client against userA's seeded row, proving RLS rejects
 * the cross-user attempt rather than mocking the boundary being tested.
 */
describe("cross-user flashcard authorization (RLS)", () => {
  let seeded: SeededUsers;

  beforeAll(async () => {
    seeded = await seedTwoUsers();
  }, 20000);

  afterAll(async () => {
    await seeded.cleanup();
  });

  it("list (flashcards/index.ts GET pattern) never returns another user's row", async () => {
    const { data, error } = await seeded.userB.client
      .from("flashcards")
      .select("*")
      .order("created_at", { ascending: false });

    expect(error).toBeNull();
    expect(data?.some((row) => row.id === seeded.userA.flashcardId)).toBe(false);
  });

  it("due-list (study/due.ts GET pattern) never returns another user's row", async () => {
    const { data, error } = await seeded.userB.client
      .from("flashcards")
      .select("*")
      .lte("due", new Date().toISOString())
      .order("due")
      .limit(20);

    expect(error).toBeNull();
    expect(data?.some((row) => row.id === seeded.userA.flashcardId)).toBe(false);
  });

  it("update (flashcards/[id].ts PATCH pattern) cannot modify another user's row", async () => {
    const { data } = await seeded.userB.client
      .from("flashcards")
      .update({ question: "hacked", answer: "hacked" })
      .eq("id", seeded.userA.flashcardId)
      .select()
      .maybeSingle();

    expect(data).toBeNull();

    const { data: unchanged } = await seeded.userA.client
      .from("flashcards")
      .select("*")
      .eq("id", seeded.userA.flashcardId)
      .single();
    expect(unchanged?.question).toBe("Seed A");
  });

  it("delete (flashcards/[id].ts DELETE pattern) cannot remove another user's row", async () => {
    const { data } = await seeded.userB.client.from("flashcards").delete().eq("id", seeded.userA.flashcardId).select();

    expect(data).toEqual([]);

    const { data: stillThere } = await seeded.userA.client
      .from("flashcards")
      .select("*")
      .eq("id", seeded.userA.flashcardId)
      .single();
    expect(stillThere).not.toBeNull();
  });

  it("grade (study/review.ts select-by-id pattern) cannot load another user's row to grade", async () => {
    const { data, error } = await seeded.userB.client
      .from("flashcards")
      .select("*")
      .eq("id", seeded.userA.flashcardId)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("create-ownership control: cannot insert a row spoofing another user's user_id", async () => {
    const { data, error } = await seeded.userB.client
      .from("flashcards")
      .insert({ question: "spoofed", answer: "spoofed", source: "manual", user_id: seeded.userA.id })
      .select();

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
