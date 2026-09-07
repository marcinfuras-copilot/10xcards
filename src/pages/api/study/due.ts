import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import type { DueCardsResponse } from "@/types";

export const prerender = false;

const BATCH_SIZE = 20;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return Response.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .select("*")
    .lte("due", new Date().toISOString())
    .order("due")
    .limit(BATCH_SIZE);

  if (error) {
    return Response.json({ error: "Couldn't fetch due flashcards" }, { status: 500 });
  }

  return Response.json({ cards: data } satisfies DueCardsResponse, { status: 200 });
};
