import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { CreateManualFlashcardRequest, CreateManualFlashcardResponse } from "@/types";

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

type Status = "idle" | "saving";

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ManualCreateForm() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const questionError =
    question.trim().length === 0
      ? "Question is required"
      : question.length > QUESTION_MAX_LENGTH
        ? `Question must be ${QUESTION_MAX_LENGTH} characters or fewer`
        : undefined;
  const answerError =
    answer.trim().length === 0
      ? "Answer is required"
      : answer.length > ANSWER_MAX_LENGTH
        ? `Answer must be ${ANSWER_MAX_LENGTH} characters or fewer`
        : undefined;
  const isValid = !questionError && !answerError;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isValid || status === "saving") return;

    setStatus("saving");
    setError(null);
    try {
      const response = await fetch("/api/flashcards/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
        } satisfies CreateManualFlashcardRequest),
      });

      if (!response.ok) {
        setError(await parseErrorMessage(response, "Couldn't save flashcard"));
        setStatus("idle");
        return;
      }

      (await response.json()) as CreateManualFlashcardResponse;
      setQuestion("");
      setAnswer("");
      setSavedCount((count) => count + 1);
      setStatus("idle");
    } catch {
      setError("Failed to reach the server. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="manual-question" className="mb-1 block text-sm text-blue-100/80">
          Question
        </label>
        <textarea
          id="manual-question"
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
          }}
          disabled={status === "saving"}
          rows={2}
          placeholder="What do you want to be asked?"
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
        {questionError ? (
          <p className="mt-1 text-xs text-red-300">{questionError}</p>
        ) : (
          <p className="mt-1 text-xs text-blue-100/40">
            {question.length}/{QUESTION_MAX_LENGTH}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="manual-answer" className="mb-1 block text-sm text-blue-100/80">
          Answer
        </label>
        <textarea
          id="manual-answer"
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
          }}
          disabled={status === "saving"}
          rows={4}
          placeholder="What's the answer?"
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
        {answerError ? (
          <p className="mt-1 text-xs text-red-300">{answerError}</p>
        ) : (
          <p className="mt-1 text-xs text-blue-100/40">
            {answer.length}/{ANSWER_MAX_LENGTH}
          </p>
        )}
      </div>

      <ServerError message={error} />

      {savedCount > 0 && !error && status === "idle" ? (
        <p className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-900/30 px-3 py-2 text-sm text-green-300">
          <CircleCheck className="size-4 shrink-0" />
          Saved! ({savedCount} so far)
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={!isValid || status === "saving"}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {status === "saving" ? "Saving..." : "Save flashcard"}
      </Button>
    </form>
  );
}
