import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { DueCardsResponse, Flashcard, SubmitReviewRequest } from "@/types";

type Status = "loading" | "active" | "empty" | "complete";

const RATINGS: { label: string; value: SubmitReviewRequest["rating"] }[] = [
  { label: "Again", value: "again" },
  { label: "Hard", value: "hard" },
  { label: "Good", value: "good" },
  { label: "Easy", value: "easy" },
];

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function StudySession() {
  const [status, setStatus] = useState<Status>("loading");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const isMounted = () => mountedRef.current;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDueCards() {
      try {
        const response = await fetch("/api/study/due");
        if (!response.ok) {
          if (!cancelled) {
            setError(await parseErrorMessage(response, "Failed to load due flashcards"));
            setStatus("empty");
          }
          return;
        }
        const data = (await response.json()) as DueCardsResponse;
        if (cancelled) return;
        if (data.cards.length === 0) {
          setStatus("empty");
        } else {
          setCards(data.cards);
          setIndex(0);
          setRevealed(false);
          setStatus("active");
        }
      } catch {
        if (!cancelled) {
          setError("Failed to reach the server. Please try again.");
          setStatus("empty");
        }
      }
    }

    void loadDueCards();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGrade(rating: SubmitReviewRequest["rating"]) {
    const card = cards[index];
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/study/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: card.id, rating } satisfies SubmitReviewRequest),
      });
      if (!isMounted()) return;

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Couldn't save your review");
        if (!isMounted()) return;
        setError(message);
        setSubmitting(false);
        return;
      }

      setSubmitting(false);
      if (index + 1 >= cards.length) {
        setStatus("complete");
      } else {
        setIndex(index + 1);
        setRevealed(false);
      }
    } catch {
      if (isMounted()) {
        setError("Failed to reach the server. Please try again.");
        setSubmitting(false);
      }
    }
  }

  if (status === "loading") {
    return <p className="text-center text-blue-100/70">Loading due flashcards...</p>;
  }

  if (status === "empty") {
    return (
      <div className="space-y-4 text-center">
        <ServerError message={error} />
        <p className="text-lg text-white">Nothing due right now.</p>
        <a href="/dashboard">
          <Button>Back to dashboard</Button>
        </a>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className="space-y-4 text-center">
        <CircleCheck className="mx-auto size-12 text-green-400" />
        <p className="text-lg text-white">Session complete!</p>
        <a href="/dashboard">
          <Button>Back to dashboard</Button>
        </a>
      </div>
    );
  }

  const card = cards[index];

  return (
    <div className="space-y-4">
      <p className="text-xs text-blue-100/50">
        Card {index + 1} of {cards.length}
      </p>

      <div className="space-y-3 rounded-lg border border-white/20 bg-white/10 p-6">
        <p className="text-lg font-medium text-white">{card.question}</p>
        {revealed && <p className="border-t border-white/10 pt-3 text-blue-100/80">{card.answer}</p>}
      </div>

      <ServerError message={error} />

      {!revealed ? (
        <Button
          className="w-full bg-purple-600 hover:bg-purple-500"
          onClick={() => {
            setRevealed(true);
          }}
        >
          Show answer
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              variant="outline"
              disabled={submitting}
              onClick={() => {
                void handleGrade(r.value);
              }}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
