import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlashcardCandidate } from "@/types";

interface CandidateCardProps {
  candidate: FlashcardCandidate;
  accepted: boolean;
  onToggleAccept: () => void;
  onEdit: () => void;
}

export function CandidateCard({ candidate, accepted, onToggleAccept, onEdit }: CandidateCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        accepted ? "border-white/20 bg-white/10" : "border-white/10 bg-white/5 opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={onToggleAccept}
            className="mt-1 size-4 shrink-0 accent-purple-500"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium text-white">{candidate.question}</p>
            <p className="text-sm text-blue-100/70">{candidate.answer}</p>
          </div>
        </label>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-purple-300 transition-colors hover:bg-white/10 hover:text-purple-100"
        >
          <Pencil className="size-3" />
          Edit
        </button>
      </div>
    </div>
  );
}
