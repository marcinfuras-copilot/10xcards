import { OPENROUTER_API_KEY } from "astro:env/server";
import type { FlashcardCandidate } from "@/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const MAX_CANDIDATES = 20;
const REQUEST_TIMEOUT_MS = 20_000;
const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

export type GenerationErrorReason = "unconfigured" | "upstream_failure" | "timeout";

export class GenerationError extends Error {
  reason: GenerationErrorReason;

  constructor(reason: GenerationErrorReason, message: string) {
    super(message);
    this.name = "GenerationError";
    this.reason = reason;
  }
}

const FLASHCARDS_SCHEMA = {
  type: "object",
  properties: {
    flashcards: {
      type: "array",
      maxItems: MAX_CANDIDATES,
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
        required: ["question", "answer"],
        additionalProperties: false,
      },
    },
  },
  required: ["flashcards"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You are a flashcard-generation assistant. Given a piece of source text, extract the facts and concepts most worth remembering and turn each into a concise question-answer flashcard pair. Generate as many high-quality flashcards as the text supports, up to 20. Keep each question under 500 characters and each answer under 2000 characters.";

interface OpenRouterChatCompletion {
  choices?: { message?: { content?: string } }[];
}

function truncateCandidate(candidate: unknown): FlashcardCandidate | null {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof (candidate as { question?: unknown }).question !== "string" ||
    typeof (candidate as { answer?: unknown }).answer !== "string"
  ) {
    return null;
  }

  const question = (candidate as { question: string }).question.trim().slice(0, QUESTION_MAX_LENGTH);
  const answer = (candidate as { answer: string }).answer.trim().slice(0, ANSWER_MAX_LENGTH);

  if (!question || !answer) {
    return null;
  }

  return { question, answer };
}

export async function generateFlashcardCandidates(sourceText: string): Promise<FlashcardCandidate[]> {
  if (!OPENROUTER_API_KEY) {
    throw new GenerationError("unconfigured", "OpenRouter is not configured");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: sourceText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "flashcards",
            strict: true,
            schema: FLASHCARDS_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GenerationError("timeout", "OpenRouter request timed out");
    }
    throw new GenerationError("upstream_failure", "Failed to reach OpenRouter");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new GenerationError("upstream_failure", `OpenRouter returned ${response.status}`);
  }

  let rawContent: string;
  try {
    const completion = (await response.json()) as OpenRouterChatCompletion;
    rawContent = completion.choices?.[0]?.message?.content ?? "";
    if (!rawContent) {
      throw new Error("empty content");
    }
  } catch {
    throw new GenerationError("upstream_failure", "OpenRouter returned an unparseable response");
  }

  let parsed: { flashcards?: unknown[] };
  try {
    parsed = JSON.parse(rawContent) as { flashcards?: unknown[] };
  } catch {
    throw new GenerationError("upstream_failure", "OpenRouter response content was not valid JSON");
  }

  if (!Array.isArray(parsed.flashcards)) {
    throw new GenerationError("upstream_failure", "OpenRouter response was missing a flashcards array");
  }

  return parsed.flashcards
    .slice(0, MAX_CANDIDATES)
    .map(truncateCandidate)
    .filter((candidate): candidate is FlashcardCandidate => candidate !== null);
}
