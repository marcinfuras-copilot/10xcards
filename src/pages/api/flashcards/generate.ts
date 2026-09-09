import type { APIRoute } from "astro";
import { z } from "zod";
import { GenerationError, generateFlashcardCandidates } from "@/lib/services/openrouter";
import type { GenerateFlashcardsResponse } from "@/types";

export const prerender = false;

const MIN_TEXT_LENGTH = 50;
const MAX_TEXT_LENGTH = 10_000;

const REASON_STATUS: Record<GenerationError["reason"], number> = {
  unconfigured: 503,
  upstream_failure: 502,
  timeout: 504,
};

const generateRequestSchema = z.object({
  text: z.string().min(MIN_TEXT_LENGTH).max(MAX_TEXT_LENGTH),
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

  const parsed = generateRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: `text must be between ${MIN_TEXT_LENGTH} and ${MAX_TEXT_LENGTH} characters` },
      { status: 400 },
    );
  }

  try {
    const candidates = await generateFlashcardCandidates(parsed.data.text);
    return Response.json({ candidates } satisfies GenerateFlashcardsResponse, { status: 200 });
  } catch (error) {
    if (error instanceof GenerationError) {
      return Response.json({ error: error.message }, { status: REASON_STATUS[error.reason] });
    }
    return Response.json({ error: "Failed to generate flashcards" }, { status: 500 });
  }
};
