import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import type { DeleteFlashcardResponse, UpdateFlashcardResponse } from "@/types";

export const prerender = false;

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const updateRequestSchema = z.object({
  question: z.string().trim().min(1).max(QUESTION_MAX_LENGTH),
  answer: z.string().trim().min(1).max(ANSWER_MAX_LENGTH),
});

export const PATCH: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = parseId(context.params.id);
  if (id === null) {
    return Response.json({ error: "Invalid flashcard id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "question and answer must be non-empty and within length limits" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .update({ question: parsed.data.question, answer: parsed.data.answer })
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
