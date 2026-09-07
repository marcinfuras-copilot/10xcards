import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FlashcardCandidate } from "@/types";

const QUESTION_MAX_LENGTH = 500;
const ANSWER_MAX_LENGTH = 2000;

interface EditCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: FlashcardCandidate;
  onSave: (updated: FlashcardCandidate) => void;
}

export function EditCandidateDialog({ open, onOpenChange, candidate, onSave }: EditCandidateDialogProps) {
  const [question, setQuestion] = useState(candidate.question);
  const [answer, setAnswer] = useState(candidate.answer);

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

  function handleSave() {
    if (!isValid) return;
    onSave({ question: question.trim(), answer: answer.trim() });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit flashcard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="edit-question" className="mb-1 block text-sm text-blue-100/80">
              Question
            </label>
            <textarea
              id="edit-question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
              }}
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
            <label htmlFor="edit-answer" className="mb-1 block text-sm text-blue-100/80">
              Answer
            </label>
            <textarea
              id="edit-answer"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
              }}
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
