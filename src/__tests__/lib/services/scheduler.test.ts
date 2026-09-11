import { describe, expect, it } from "vitest";
import { gradeCard } from "@/lib/services/scheduler";
import { FsrsState, type Flashcard } from "@/types";

function reviewStateFixture(overrides: Partial<Flashcard> = {}): Flashcard {
  return {
    id: 1,
    user_id: "test-user",
    question: "Q",
    answer: "A",
    source: "manual",
    was_edited: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    due: "2026-01-01T00:00:00.000Z",
    stability: 5,
    difficulty: 5,
    elapsed_days: 3,
    scheduled_days: 3,
    learning_steps: 0,
    reps: 2,
    lapses: 0,
    state: FsrsState.Review,
    last_review: "2025-12-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("gradeCard", () => {
  const now = new Date("2026-01-05T00:00:00.000Z");

  it("increments lapses and moves to Relearning when rating Again from Review", () => {
    const row = reviewStateFixture();
    const update = gradeCard(row, "again", now);

    expect(update.state).toBe(FsrsState.Relearning);
    expect(update.lapses).toBe(row.lapses + 1);
  });

  it.each(["hard", "good", "easy"] as const)(
    "does not increment lapses or move to Relearning when rating %s from Review",
    (rating) => {
      const row = reviewStateFixture();
      const update = gradeCard(row, rating, now);

      expect(update.lapses).toBe(row.lapses);
      expect(update.state).not.toBe(FsrsState.Relearning);
    },
  );

  it("schedules progressively further out as the rating gets easier (hard <= good <= easy)", () => {
    const row = reviewStateFixture();
    const dueMs = (rating: "hard" | "good" | "easy") => new Date(gradeCard(row, rating, now).due ?? "").getTime();

    expect(dueMs("good")).toBeGreaterThanOrEqual(dueMs("hard"));
    expect(dueMs("easy")).toBeGreaterThanOrEqual(dueMs("good"));
  });

  it("advances a brand-new card out of the New state on first review", () => {
    const row = reviewStateFixture({
      state: FsrsState.New,
      reps: 0,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      learning_steps: 0,
      last_review: null,
    });

    const update = gradeCard(row, "good", now);

    expect(update.state).not.toBe(FsrsState.New);
  });
});
