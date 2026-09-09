import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { gradeCard } from "@/lib/services/scheduler";

export const prerender = false;

const reviewRequestSchema = z.object({
  id: z.number(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await context.request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = reviewRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: "id and a valid rating are required" }, { status: 400 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data: row, error: selectError } = await supabase
    .from("flashcards")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (selectError) {
    return Response.json({ error: "Couldn't load flashcard" }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "Flashcard not found" }, { status: 404 });
  }

  const update = gradeCard(row, parsed.data.rating, new Date());

  const { error: updateError } = await supabase.from("flashcards").update(update).eq("id", parsed.data.id);
  if (updateError) {
    return Response.json({ error: "Couldn't save review" }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 200 });
};
