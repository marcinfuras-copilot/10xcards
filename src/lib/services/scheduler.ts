import { fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { Flashcard, FlashcardUpdate } from "@/types";

const scheduler = fsrs();

export type ReviewRating = "again" | "hard" | "good" | "easy";

const RATING_MAP: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function rowToCard(row: Flashcard): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function gradeCard(row: Flashcard, rating: ReviewRating, now: Date): FlashcardUpdate {
  const card = rowToCard(row);
  const { card: updated } = scheduler.next(card, now, RATING_MAP[rating]);

  return {
    due: updated.due.toISOString(),
    stability: updated.stability,
    difficulty: updated.difficulty,
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- ts-fsrs still requires this field on Card until v6.0.0
    elapsed_days: updated.elapsed_days,
    scheduled_days: updated.scheduled_days,
    learning_steps: updated.learning_steps,
    reps: updated.reps,
    lapses: updated.lapses,
    state: updated.state,
    last_review: updated.last_review ? updated.last_review.toISOString() : null,
  };
}
