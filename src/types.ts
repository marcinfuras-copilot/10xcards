import type { Database } from "./db/database.types";

export type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];
export type FlashcardInsert = Database["public"]["Tables"]["flashcards"]["Insert"];
export type FlashcardUpdate = Database["public"]["Tables"]["flashcards"]["Update"];

// Matches ts-fsrs's State enum (0=New, 1=Learning, 2=Review, 3=Relearning)
export enum FsrsState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface FlashcardCandidate {
  question: string;
  answer: string;
}

export interface GenerateFlashcardsRequest {
  text: string;
}

export interface GenerateFlashcardsResponse {
  candidates: FlashcardCandidate[];
}

export interface SaveFlashcardsRequest {
  cards: { question: string; answer: string; wasEdited: boolean }[];
}

export interface SaveFlashcardsResponse {
  saved: number;
}

export interface DueCardsResponse {
  cards: Flashcard[];
}

export interface SubmitReviewRequest {
  id: number;
  rating: "again" | "hard" | "good" | "easy";
}
