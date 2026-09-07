import { CircleAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/auth/ServerError";

const MIN_TEXT_LENGTH = 50;
const MAX_TEXT_LENGTH = 10_000;

interface GenerateFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  error?: string | null;
}

export function GenerateForm({ value, onChange, onSubmit, pending, error }: GenerateFormProps) {
  const tooShort = value.length > 0 && value.length < MIN_TEXT_LENGTH;
  const tooLong = value.length > MAX_TEXT_LENGTH;
  const isValid = value.length >= MIN_TEXT_LENGTH && value.length <= MAX_TEXT_LENGTH;

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isValid && !pending) {
      onSubmit();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="source-text" className="mb-1 block text-sm text-blue-100/80">
          Paste your source text
        </label>
        <textarea
          id="source-text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          disabled={pending}
          rows={10}
          placeholder="Paste an article, documentation, or notes you want to turn into flashcards..."
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:border-purple-400 focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          {tooShort || tooLong ? (
            <p className="flex items-center gap-1 text-red-300">
              <CircleAlert className="size-3" />
              {tooShort
                ? `${MIN_TEXT_LENGTH - value.length} more character${MIN_TEXT_LENGTH - value.length !== 1 ? "s" : ""} needed`
                : `Text is too long by ${value.length - MAX_TEXT_LENGTH} characters`}
            </p>
          ) : (
            <span />
          )}
          <span className="text-blue-100/40">
            {value.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
      </div>

      <ServerError message={error} />

      <Button
        type="submit"
        disabled={!isValid || pending}
        className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Generating flashcards...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Sparkles className="size-4" />
            Generate flashcards
          </span>
        )}
      </Button>
    </form>
  );
}
