import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { FlashcardInsert, ListFlashcardsResponse, SaveFlashcardsResponse } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;
// Matches MAX_CANDIDATES in src/lib/services/openrouter.ts — a single generation batch is the largest
// legitimate save, so a direct API call shouldn't be able to exceed it either.
const MAX_CARDS_PER_SAVE = 20;

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

const saveRequestSchema = z.object({
  cards: z
    .array(
      z.object({
        question: z.string().min(1).max(QUESTION_MAX_LENGTH),
        answer: z.string().min(1).max(ANSWER_MAX_LENGTH),
        wasEdited: z.boolean(),
      }),
    )
    .min(1)
    .max(MAX_CARDS_PER_SAVE),
});

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = saveRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "cards must be a non-empty array of valid question/answer pairs" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const rows: FlashcardInsert[] = parsed.data.cards.map((card) => ({
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
