import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { GenerateForm } from "@/components/flashcards/GenerateForm";
import { CandidateCard } from "@/components/flashcards/CandidateCard";
import { EditCandidateDialog } from "@/components/flashcards/EditCandidateDialog";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";
import type {
  FlashcardCandidate,
  GenerateFlashcardsRequest,
  GenerateFlashcardsResponse,
  SaveFlashcardsRequest,
  SaveFlashcardsResponse,
} from "@/types";

type Status = "idle" | "loading" | "reviewing" | "saving" | "done";

interface ReviewCandidate extends FlashcardCandidate {
  id: string;
  accepted: boolean;
  wasEdited: boolean;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ReviewSession() {
  const [sourceText, setSourceText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [candidates, setCandidates] = useState<ReviewCandidate[]>([]);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const mountedRef = useRef(true);
  const isMounted = () => mountedRef.current;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const acceptedCount = candidates.filter((c) => c.accepted).length;
  const editingCandidate = candidates.find((c) => c.id === editingId) ?? null;

  async function handleGenerate() {
    setStatus("loading");
    setGenerateError(null);
    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sourceText } satisfies GenerateFlashcardsRequest),
      });

      if (!isMounted()) return;

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to generate flashcards");
        if (!isMounted()) return;
        setGenerateError(message);
        setStatus("idle");
        return;
      }

      const data = (await response.json()) as GenerateFlashcardsResponse;
      if (!isMounted()) return;
      setCandidates(
        data.candidates.map((candidate) => ({
          ...candidate,
          id: crypto.randomUUID(),
          accepted: true,
          wasEdited: false,
        })),
      );
      setStatus("reviewing");
    } catch {
      if (isMounted()) {
        setGenerateError("Failed to reach the server. Please try again.");
        setStatus("idle");
      }
    }
  }

  function toggleAccept(id: string) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, accepted: !c.accepted } : c)));
  }

  function saveEdit(id: string, updated: FlashcardCandidate) {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated, wasEdited: true } : c)));
    setEditingId(null);
  }

  async function handleSaveAccepted() {
    const accepted = candidates.filter((c) => c.accepted);
    if (accepted.length === 0) return;

    setStatus("saving");
    setSaveError(null);
    try {
      const response = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: accepted.map((c) => ({ question: c.question, answer: c.answer, wasEdited: c.wasEdited })),
        } satisfies SaveFlashcardsRequest),
      });

      if (!isMounted()) return;

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Couldn't save flashcards");
        if (!isMounted()) return;
        setSaveError(message);
        setStatus("reviewing");
        return;
      }

      const data = (await response.json()) as SaveFlashcardsResponse;
      if (!isMounted()) return;
      setSavedCount(data.saved);
      setStatus("done");
    } catch {
      if (isMounted()) {
        setSaveError("Failed to reach the server. Please try again.");
        setStatus("reviewing");
      }
    }
  }

  function handleStartOver() {
    setSourceText("");
    setCandidates([]);
    setGenerateError(null);
    setSaveError(null);
    setSavedCount(0);
    setStatus("idle");
  }

  if (status === "done") {
    return (
      <div className="space-y-4 text-center">
        <CircleCheck className="mx-auto size-12 text-green-400" />
        <p className="text-lg text-white">
          Saved {savedCount} flashcard{savedCount !== 1 ? "s" : ""}!
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={handleStartOver}>
            Generate more
          </Button>
          <a href="/dashboard">
            <Button>Back to dashboard</Button>
          </a>
        </div>
      </div>
    );
  }

  if (status === "reviewing" || status === "saving") {
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              accepted={candidate.accepted}
              onToggleAccept={() => {
                toggleAccept(candidate.id);
              }}
              onEdit={() => {
                setEditingId(candidate.id);
              }}
            />
          ))}
        </div>

        <ServerError message={saveError} />

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-blue-100/70">{acceptedCount} selected</p>
          <Button
            onClick={handleSaveAccepted}
            disabled={acceptedCount === 0 || status === "saving"}
            className="bg-purple-600 hover:bg-purple-500"
          >
            {status === "saving" ? "Saving..." : `Save ${acceptedCount} accepted`}
          </Button>
        </div>

        {editingCandidate && (
          <EditCandidateDialog
            key={editingCandidate.id}
            open={true}
            onOpenChange={(open) => {
              if (!open) setEditingId(null);
            }}
            candidate={editingCandidate}
            onSave={(updated) => {
              saveEdit(editingCandidate.id, updated);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <GenerateForm
      value={sourceText}
      onChange={setSourceText}
      onSubmit={handleGenerate}
      pending={status === "loading"}
      error={generateError}
    />
  );
}
