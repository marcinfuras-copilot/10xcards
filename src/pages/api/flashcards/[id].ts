import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { DeleteFlashcardResponse, UpdateFlashcardRequest, UpdateFlashcardResponse } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidRequest(body: unknown): body is UpdateFlashcardRequest {
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

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseId(context.params.id);
  if (id === null) {
    return Response.json({ error: "Invalid flashcard id" }, { status: 400 });
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

  const { data, error } = await supabase
    .from("flashcards")
    .update({ question: body.question, answer: body.answer })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Couldn't update flashcard" }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  return Response.json({ flashcard: data } satisfies UpdateFlashcardResponse, { status: 200 });
};

export const DELETE: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseId(context.params.id);
  if (id === null) {
    return Response.json({ error: "Invalid flashcard id" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase.from("flashcards").delete().eq("id", id).select();
  if (error) {
    return Response.json({ error: "Couldn't delete flashcard" }, { status: 500 });
  }
  if (data.length === 0) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  return Response.json({ ok: true } satisfies DeleteFlashcardResponse, { status: 200 });
};
