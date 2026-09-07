import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { gradeCard, type ReviewRating } from "@/lib/services/scheduler";
import type { SubmitReviewRequest } from "@/types";

export const prerender = false;

const VALID_RATINGS = new Set<ReviewRating>(["again", "hard", "good", "easy"]);

function isValidRating(value: unknown): value is ReviewRating {
  return typeof value === "string" && VALID_RATINGS.has(value as ReviewRating);
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SubmitReviewRequest;
  try {
    body = (await context.request.json()) as SubmitReviewRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "number" || !isValidRating(body.rating)) {
    return Response.json({ error: "id and a valid rating are required" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data: row, error: selectError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();

  if (selectError) {
    return Response.json({ error: "Couldn't load flashcard" }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  const update = gradeCard(row, body.rating, new Date());

  const { error: updateError } = await supabase.from("flashcards").update(update).eq("id", body.id);
  if (updateError) {
    return Response.json({ error: "Couldn't save review" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
