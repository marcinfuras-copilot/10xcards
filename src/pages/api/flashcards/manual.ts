import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { CreateManualFlashcardRequest, CreateManualFlashcardResponse, FlashcardInsert } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

function isValidRequest(body: unknown): body is CreateManualFlashcardRequest {
  if (typeof body !== "object" || body === null) return false;
  const { question, answer } = body as Record<string, unknown>;
  return (
    typeof question === "string" &&
    question.length > 0 &&
    question.length <= QUESTION_MAX_LENGTH &&
    typeof answer === "string" &&
    answer.length > 0 &&
    answer.length <= ANSWER_MAX_LENGTH
  );
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return Response.json({ error: "question and answer must be non-empty and within length limits" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const row: FlashcardInsert = {
    question: body.question,
    answer: body.answer,
    source: "manual",
    was_edited: false,
    user_id: user.id,
  };

  const { data, error } = await supabase.from("flashcards").insert(row).select().single();
  if (error) {
    return Response.json({ error: "Couldn't save flashcard" }, { status: 500 });
  }

  return Response.json({ flashcard: data } satisfies CreateManualFlashcardResponse, { status: 200 });
};
