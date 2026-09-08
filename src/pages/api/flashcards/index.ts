import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { FlashcardInsert, ListFlashcardsResponse, SaveFlashcardsRequest, SaveFlashcardsResponse } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase.from("flashcards").select("*").order("created_at", { ascending: false });
  if (error) {
    return Response.json({ error: "Couldn't fetch flashcards" }, { status: 500 });
  }

  return Response.json({ flashcards: data } satisfies ListFlashcardsResponse, { status: 200 });
};

function isValidCard(card: unknown): card is SaveFlashcardsRequest["cards"][number] {
  if (typeof card !== "object" || card === null) return false;
  const { question, answer, wasEdited } = card as Record<string, unknown>;
  return (
    typeof question === "string" &&
    question.length > 0 &&
    question.length <= QUESTION_MAX_LENGTH &&
    typeof answer === "string" &&
    answer.length > 0 &&
    answer.length <= ANSWER_MAX_LENGTH &&
    typeof wasEdited === "boolean"
  );
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveFlashcardsRequest;
  try {
    body = (await context.request.json()) as SaveFlashcardsRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.cards) || body.cards.length === 0 || !body.cards.every(isValidCard)) {
    return Response.json({ error: "cards must be a non-empty array of valid question/answer pairs" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const rows: FlashcardInsert[] = body.cards.map((card) => ({
    question: card.question,
    answer: card.answer,
    was_edited: card.wasEdited,
    source: "ai",
    user_id: user.id,
  }));

  const { error } = await supabase.from("flashcards").insert(rows);
  if (error) {
    return Response.json({ error: "Couldn't save flashcards" }, { status: 500 });
  }

  return Response.json({ saved: rows.length } satisfies SaveFlashcardsResponse, { status: 200 });
};
