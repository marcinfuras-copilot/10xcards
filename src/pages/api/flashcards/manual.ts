import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { CreateManualFlashcardResponse, FlashcardInsert } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

const createRequestSchema = z.object({
  question: z.string().trim().min(1).max(QUESTION_MAX_LENGTH),
  answer: z.string().trim().min(1).max(ANSWER_MAX_LENGTH),
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

  const parsed = createRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "question and answer must be non-empty and within length limits" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const row: FlashcardInsert = {
    question: parsed.data.question,
    answer: parsed.data.answer,
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
