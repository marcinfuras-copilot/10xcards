import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import { EditFlashcardDialog } from "@/components/flashcards/EditFlashcardDialog";
import { DeleteFlashcardDialog } from "@/components/flashcards/DeleteFlashcardDialog";
import type { Flashcard, ListFlashcardsResponse } from "@/types";

type Status = "loading" | "empty" | "ready";

const ANSWER_PREVIEW_LENGTH = 120;

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export default function FlashcardList() {
  const [status, setStatus] = useState<Status>("loading");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Flashcard | null>(null);
  const [deleting, setDeleting] = useState<Flashcard | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFlashcards() {
      try {
        const response = await fetch("/api/flashcards");
        if (!response.ok) {
          if (!cancelled) {
            setError(await parseErrorMessage(response, "Failed to load flashcards"));
            setStatus("empty");
          }
          return;
        }
        const data = (await response.json()) as ListFlashcardsResponse;
        if (cancelled) return;
        setFlashcards(data.flashcards);
        setStatus(data.flashcards.length === 0 ? "empty" : "ready");
      } catch {
        if (!cancelled) {
          setError("Failed to reach the server. Please try again.");
          setStatus("empty");
        }
      }
    }

    void loadFlashcards();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSaved(updated: Flashcard) {
    setFlashcards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleDeleted(id: number) {
    const next = flashcards.filter((c) => c.id !== id);
    setFlashcards(next);
    if (next.length === 0) setStatus("empty");
  }

  if (status === "loading") {
    return <p className="text-center text-blue-100/70">Loading flashcards...</p>;
  }

  if (status === "empty") {
    return (
      <div className="space-y-4 text-center">
        <ServerError message={error} />
        <p className="text-lg text-white">You don&rsquo;t have any flashcards yet.</p>
        <div className="flex justify-center gap-3">
          <a href="/flashcards/new">
            <Button variant="outline">Generate flashcards</Button>
          </a>
          <a href="/flashcards/manual">
            <Button>New flashcard</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ServerError message={error} />

      <div className="space-y-3">
        {flashcards.map((card) => (
          <div key={card.id} className="rounded-lg border border-white/20 bg-white/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-white">{card.question}</p>
                <p className="mt-1 text-sm text-blue-100/70">{truncate(card.answer, ANSWER_PREVIEW_LENGTH)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Edit flashcard"
                  onClick={() => {
                    setEditing(card);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete flashcard"
                  onClick={() => {
                    setDeleting(card);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditFlashcardDialog
          key={`edit-${editing.id}`}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          flashcard={editing}
          onSaved={(updated) => {
            handleSaved(updated);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteFlashcardDialog
          key={`delete-${deleting.id}`}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          flashcard={deleting}
          onDeleted={(id) => {
            handleDeleted(id);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
