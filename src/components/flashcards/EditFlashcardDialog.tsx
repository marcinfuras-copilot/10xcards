import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { Flashcard, UpdateFlashcardRequest, UpdateFlashcardResponse } from "@/types";

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

interface EditFlashcardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flashcard: Flashcard;
  onSaved: (updated: Flashcard) => void;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function EditFlashcardDialog({ open, onOpenChange, flashcard, onSaved }: EditFlashcardDialogProps) {
  const [question, setQuestion] = useState(flashcard.question);
  const [answer, setAnswer] = useState(flashcard.answer);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const isMounted = () => mountedRef.current;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  async function handleSave() {
    if (!isValid || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/flashcards/${flashcard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
        } satisfies UpdateFlashcardRequest),
      });

      if (!isMounted()) return;

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Couldn't save flashcard");
        if (!isMounted()) return;
        setError(message);
        setSaving(false);
        return;
      }

      const data = (await response.json()) as UpdateFlashcardResponse;
      if (!isMounted()) return;
      onSaved(data.flashcard);
      onOpenChange(false);
    } catch {
      if (isMounted()) {
        setError("Failed to reach the server. Please try again.");
        setSaving(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit flashcard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="edit-flashcard-question" className="mb-1 block text-sm text-blue-100/80">
              Question
            </label>
            <textarea
              id="edit-flashcard-question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
              }}
              disabled={saving}
              rows={2}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
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
            <label htmlFor="edit-flashcard-answer" className="mb-1 block text-sm text-blue-100/80">
              Answer
            </label>
            <textarea
              id="edit-flashcard-answer"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
              }}
              disabled={saving}
              rows={4}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
