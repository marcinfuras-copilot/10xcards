import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type { Flashcard } from "@/types";

interface DeleteFlashcardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flashcard: Flashcard;
  onDeleted: (id: number) => void;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function DeleteFlashcardDialog({ open, onOpenChange, flashcard, onDeleted }: DeleteFlashcardDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const isMounted = () => mountedRef.current;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleDelete() {
    if (deleting) return;

    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/flashcards/${flashcard.id}`, { method: "DELETE" });
      if (!isMounted()) return;

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Couldn't delete flashcard");
        if (!isMounted()) return;
        setError(message);
        setDeleting(false);
        return;
      }

      onDeleted(flashcard.id);
      onOpenChange(false);
    } catch {
      if (isMounted()) {
        setError("Failed to reach the server. Please try again.");
        setDeleting(false);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete flashcard</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-blue-100/80">
          Delete &ldquo;{flashcard.question}&rdquo;? This can&rsquo;t be undone.
        </p>

        <ServerError message={error} />

        <DialogFooter>
          <Button
            variant="outline"
            disabled={deleting}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
