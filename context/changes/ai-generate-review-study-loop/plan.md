# AI Generate → Review → Save → Study Loop Implementation Plan

## Overview

Build the product's north-star slice end-to-end: a logged-in user pastes source text, receives AI-generated flashcard candidates (via OpenRouter), reviews each one (accept/edit/reject), has accepted cards saved to their account, and can start a spaced-repetition study session over them using `ts-fsrs`.

## Current State Analysis

- The `flashcards` table exists (from F-01) with RLS scoped to `auth.uid()` and FSRS-shaped columns (`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`), typed via `src/types.ts` (`Flashcard`, `FlashcardInsert`, `FlashcardUpdate`, `FsrsState`). No further migration is needed for this slice.
- `ts-fsrs` is not installed yet — F-01 deliberately deferred it here.
- No AI provider dependency exists yet. `infrastructure.md` has already committed to **OpenRouter** as the provider; no `OPENROUTER_API_KEY` env var is declared in `astro.config.mjs`.
- Every existing API route (`src/pages/api/auth/*`) uses `context.request.formData()` + `context.redirect(...)` — there is no JSON/fetch-based API convention anywhere in the codebase yet.
- `src/middleware.ts` protects page routes by pathname prefix (`PROTECTED_ROUTES`) and redirects unauthenticated users to `/auth/signin`. It does not run against API routes' auth needs in a way that's useful for JSON endpoints — a redirect response is meaningless to a `fetch()` caller.
- `components.json` (shadcn, "new-york" style) has only `button.tsx` installed so far. No `dialog` component exists.
- No test runner is configured (per F-01's precedent); this plan follows the same manual-verification approach.

## Desired End State

A logged-in user can navigate to a "Generate flashcards" page, paste text, see AI-generated candidates, accept/edit/reject each one, save the accepted set to their account, then navigate to a "Study" page and run a spaced-repetition session (FSRS 4-button grading) over their due cards.

**Verification**: `npm run lint`, `npx astro check`, and `npm run build` pass after each phase; manual walkthroughs (documented per phase) confirm the generate call returns candidates, accepted cards persist correctly with the right `source`/`was_edited` values, and a full study session correctly reschedules cards via `ts-fsrs`.

### Key Discoveries:

- OpenRouter's chat completions endpoint (`https://openrouter.ai/api/v1/chat/completions`) is a plain OpenAI-compatible REST API — no SDK dependency is needed, just `fetch` with an `Authorization: Bearer <key>` header, consistent with this codebase having no HTTP client library. Structured output is requested via `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`; only some models/providers support it, so the plan pins one that does.
- `ts-fsrs` exposes `createEmptyCard()`, `fsrs(params)` / `generatorParameters()`, a `Rating` enum (`Again`/`Hard`/`Good`/`Easy`), and `next(card, date, rating)` which returns the updated `Card` + a review log. The `Card` interface's field names (`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`) match the `flashcards` table 1:1, confirming F-01's schema design needs no adapter/translation layer.
- `src/lib/config-status.ts` + `Layout.astro` already have a working "missing config → sitewide banner" pattern for Supabase; the same pattern extends cleanly to a missing `OPENROUTER_API_KEY`.
- The `flashcards` table's `question`/`answer` `CHECK` constraints (≤500 / ≤2000 chars) mean AI-generated candidates that exceed those lengths will fail at insert time (Phase 2) unless validated/truncated when the generation route returns them (Phase 1).

## What We're NOT Doing

- Not building the standalone manual-creation form (S-02) or the flashcard browse/edit/delete list (S-03) — this slice's only "creation" path is AI generate → review → save.
- Not persisting per-review history/logs — `ts-fsrs`'s review log return value is used only to compute the updated card fields; only current scheduling state lives on the `flashcards` row, matching F-01's minimal schema.
- Not persisting AI-generated candidates before the user accepts them — review state lives entirely in client-side React state (confirmed decision; also the better fit for the data-retention NFR).
- Not implementing streaming responses or an async job/polling architecture for generation — a synchronous request/response with inline retry on failure (confirmed decision).
- Not adding new infrastructure (KV, a queue, a second deploy target) to work around the Cloudflare Workers CPU cap — this plan assumes the already-documented $5/mo paid-plan upgrade happens before this route carries real traffic (confirmed decision; tracked as an ops risk, not a code concern).
- Not adding a test runner — automated verification stays lint/typecheck/build; AI parsing and the study session are verified manually (confirmed decision, consistent with F-01).
- Not capping/paginating a "study session" beyond a single batch of due cards (see Phase 3) — a full study-history or multi-session queue view is out of scope.
- Not supporting non-text input (PDF, DOCX, etc.) — copy-paste text only, per the PRD's non-goals.

## Implementation Approach

Three phases, each a vertically testable slice: (1) the AI generation backend in isolation, (2) the review UI wired end-to-end through to persistence, and (3) the spaced-repetition study session (backend + UI together, since they're tightly coupled). JSON API routes + client-side React state power the interactive review and study flows — a new pattern for this codebase, chosen over form-post-per-action because reviewing multiple candidates or grading multiple study cards via full-page reloads would be slow and jarring.

## Critical Implementation Details

### API route auth pattern

The existing `src/middleware.ts` only protects **page** routes (`PROTECTED_ROUTES`) and responds to violations with a redirect — meaningless to a `fetch()` caller. All new API routes in this plan (`/api/flashcards/*`, `/api/study/*`) must independently check `context.locals.user` and return a `401` JSON response when absent, rather than relying on middleware. Separately, add `/flashcards` and `/study` to `PROTECTED_ROUTES` so the *pages* still redirect unauthenticated visitors to sign-in.

### Candidate validation before returning to the client

The generation route must validate (and truncate, not silently drop) each AI-returned candidate against the same limits as the `flashcards` table's `CHECK` constraints (question 1–500 chars, answer 1–2000 chars) before sending candidates to the client. Skipping this means a candidate the user accepts unmodified can fail at insert time in Phase 2 with a raw Postgres constraint error.

### Server-set `user_id`, not client-supplied

The save endpoint must set each row's `user_id` from `context.locals.user.id` server-side — never from the request body — even though the RLS `with check` policy would also reject a mismatched value. This avoids a class of insert failures being the *first* line of defense against a spoofed `user_id`.

### Rating contract is a stable string, not the library's enum ordinal

The study-review endpoint accepts a rating as one of the strings `"again" | "hard" | "good" | "easy"` from the client and maps it to `ts-fsrs`'s `Rating` enum server-side. This keeps the client/server contract stable regardless of the library's internal enum numbering, and means the client never needs `ts-fsrs` in its bundle.

## Phase 1: AI Generation Backend

### Overview

Add OpenRouter configuration and a server-side service that turns pasted text into validated flashcard candidates, exposed via a JSON API route. No persistence in this phase.

### Changes Required:

#### 1. OpenRouter env wiring

**File**: `astro.config.mjs`

**Intent**: Declare the OpenRouter API key the same way `SUPABASE_URL`/`SUPABASE_KEY` are declared, so the service can read it via `astro:env/server` and the app degrades gracefully (feature disabled, not a crash) when unset.

**Contract**: Add `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` to the `env.schema` block.

#### 2. Config status banner

**File**: `src/lib/config-status.ts`

**Intent**: Extend the existing "missing config → sitewide banner" pattern to cover OpenRouter, consistent with how a missing Supabase config is surfaced today.

**Contract**: Add a `ConfigStatus` entry for `"OpenRouter"` gated on `Boolean(OPENROUTER_API_KEY)`, following the existing `Supabase` entry's shape.

#### 3. OpenRouter generation service

**File**: `src/lib/services/openrouter.ts`

**Intent**: Isolate the OpenRouter call, prompt, structured-output schema, and candidate validation/truncation behind one function so the API route stays thin.

**Contract**: `generateFlashcardCandidates(sourceText: string): Promise<FlashcardCandidate[]>` (throws a typed error — e.g. `GenerationError` with a `reason` of `"unconfigured" | "upstream_failure" | "timeout"` — on failure, caught by the route). Internally: POST to `https://openrouter.ai/api/v1/chat/completions` with `response_format: { type: "json_schema", ... }` requesting an object-rooted schema — `{ type: "object", properties: { flashcards: { type: "array", items: { question, answer }, maxItems: 20 } }, required: ["flashcards"] }` — from a structured-output-capable model (e.g. `openai/gpt-4o-mini`, hardcoded as a constant — swappable later without a schema change), parsing `response.flashcards` (an object root matches OpenRouter's documented structured-output shape; a bare top-level array schema risks rejection or mishandling by some providers' strict mode); apply a 20-second request timeout; validate/truncate each returned candidate to the `flashcards` table's length constraints per "Critical Implementation Details" above, dropping only candidates with an empty question or answer after trimming.

#### 4. Shared DTOs

**File**: `src/types.ts`

**Intent**: Give the API route and the future UI a shared contract for the generation request/response.

**Contract**: Add `FlashcardCandidate` (`{ question: string; answer: string }`), `GenerateFlashcardsRequest` (`{ text: string }`), and `GenerateFlashcardsResponse` (`{ candidates: FlashcardCandidate[] }` on success).

#### 5. Generation API route

**File**: `src/pages/api/flashcards/generate.ts`

**Intent**: Validate the authenticated request, enforce input-length bounds, call the service, and return JSON — the first JSON (non-form) API route in this codebase.

**Contract**: `export const prerender = false;` `POST` handler: 401 JSON if `context.locals.user` is absent; parse JSON body, reject (400) if `text` is missing, under 50 chars, or over 10,000 chars; call `generateFlashcardCandidates`; on success return `{ candidates }` with 200; on `GenerationError` return an appropriate 4xx/5xx with `{ error: string }` matching the error's `reason`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With `OPENROUTER_API_KEY` set locally (`.dev.vars`), POSTing valid text (via curl/Postman with an authenticated session cookie) to `/api/flashcards/generate` returns a non-empty `candidates` array of valid question/answer pairs.
- Posting text under 50 chars or over 10,000 chars returns a 400 with a clear error.
- Posting without an authenticated session returns 401.
- With `OPENROUTER_API_KEY` unset, the route returns a clear "unconfigured" error instead of throwing, and the sitewide config banner shows the OpenRouter warning.

---

## Phase 2: Review UI & Save

### Overview

Build the paste-text → review (accept/edit/reject) → save flow end-to-end: a new page + React island calls the Phase 1 generation route, lets the user work through candidates, and persists the accepted set via a new save endpoint.

### Changes Required:

#### 1. Dialog primitive

**File**: `src/components/ui/dialog.tsx`

**Intent**: Install the shadcn `dialog` component (not yet present) to power the edit-candidate modal, per the confirmed "modal dialog for editing" decision.

**Contract**: Output of `npx shadcn@latest add dialog`, unmodified.

#### 2. Save DTOs

**File**: `src/types.ts`

**Intent**: Define the request/response contract for persisting accepted candidates.

**Contract**: Add `SaveFlashcardsRequest` (`{ cards: { question: string; answer: string; wasEdited: boolean }[] }`) and `SaveFlashcardsResponse` (`{ saved: number }`).

#### 3. Save API route

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Insert the accepted/edited candidates as the authenticated user's flashcards, tagged with their provenance.

**Contract**: `export const prerender = false;` `POST` handler: 401 JSON if unauthenticated; validate `cards` is a non-empty array within the same length constraints as Phase 1; build `FlashcardInsert[]` rows with `source: "ai"`, `was_edited` from each card, and `user_id` set server-side from `context.locals.user.id` (never from the body, per "Critical Implementation Details"); `supabase.from("flashcards").insert(rows)`; return `{ saved: rows.length }` on success or a 4xx/5xx with `{ error }` on failure (including a Postgres constraint violation, surfaced as a generic "couldn't save" message).

#### 4. Generate + review page

**File**: `src/pages/flashcards/new.astro`

**Intent**: Host the paste/review/save React island behind auth; add this path to protected routes.

**Contract**: Page renders `<ReviewSession client:load />` inside `Layout`; add `"/flashcards"` to `PROTECTED_ROUTES` in `src/middleware.ts`.

#### 5. Review session orchestration

**File**: `src/components/flashcards/ReviewSession.tsx`

**Intent**: Own the top-level flow state (idle → loading → reviewing → saving → done/error) and coordinate the paste form, candidate list, and save action.

**Contract**: State machine over `{ status, candidates: (FlashcardCandidate & { id: string; accepted: boolean; wasEdited: boolean })[] }`; calls `POST /api/flashcards/generate` on submit, `POST /api/flashcards` on save; renders `GenerateForm` while idle/loading, the candidate list + "Save accepted" action while reviewing, and a success/error state after saving.

#### 6. Paste-text form

**File**: `src/components/flashcards/GenerateForm.tsx`

**Intent**: Collect source text with the same validation-and-disable-while-pending style as `SignUpForm`/`FormField`.

**Contract**: Textarea bound to local state; disable submit for `< 50` or `> 10,000` chars with an inline hint (mirroring `FormField`'s error pattern); disable submit while a request is in flight (mirroring `SubmitButton`'s `useFormStatus`-style pending state, adapted for a `fetch`-driven island rather than a native form action).

#### 7. Candidate card

**File**: `src/components/flashcards/CandidateCard.tsx`

**Intent**: Render one candidate with accept/reject toggle and an "Edit" trigger.

**Contract**: Props `{ candidate, accepted, onToggleAccept, onEdit }`; visually distinguishes accepted vs. rejected state; "Edit" opens `EditCandidateDialog`.

#### 8. Edit dialog

**File**: `src/components/flashcards/EditCandidateDialog.tsx`

**Intent**: Let the user modify a candidate's question/answer before saving, enforcing the same length limits as the DB.

**Contract**: Built on `src/components/ui/dialog.tsx`; controlled `open`/`onOpenChange`; on save, calls back with the edited `{ question, answer }` and marks the candidate `wasEdited: true`; validates 1–500 / 1–2000 char bounds inline, mirroring `FormField`'s error display.

#### 9. Navigation entry point

**File**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`

**Intent**: Give signed-in users a way to reach the new page from both the post-signin landing page and the dashboard, which currently has no navigation beyond sign-out.

**Contract**: Add a `/flashcards/new` link next to the existing `/dashboard` link in `Topbar.astro`, shown only when `user` is present; also render `Topbar` on `dashboard.astro` (or duplicate the same links there) so the link isn't lost once a user navigates past the landing page.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Pasting valid text and submitting shows the generated candidates.
- Rejecting a candidate excludes it from the accepted count; accepting it again includes it.
- Editing a candidate via the dialog updates its displayed text and marks it edited.
- Saving persists exactly the accepted candidates to `public.flashcards` with `source = 'ai'` and `was_edited` set correctly per card (verified via Studio or `psql`).
- Attempting to reach `/flashcards/new` while signed out redirects to `/auth/signin`.

---

## Phase 3: Spaced-Repetition Study Session

### Overview

Add `ts-fsrs`, a scheduling service wrapping it, endpoints to fetch due cards and submit a grade, and a study session UI that presents one due card at a time.

### Changes Required:

#### 1. Dependency

**File**: `package.json`

**Intent**: Add the SR library F-01's schema was designed around.

**Contract**: `npm install ts-fsrs` (runtime dependency).

#### 2. Scheduling service

**File**: `src/lib/services/scheduler.ts`

**Intent**: Translate between the `flashcards` row shape and `ts-fsrs`'s `Card`, and compute the next scheduling state for a graded review.

**Contract**: `rowToCard(row: Flashcard): Card` (direct 1:1 field mapping, per Key Discoveries); `gradeCard(row: Flashcard, rating: "again" | "hard" | "good" | "easy", now: Date): FlashcardUpdate` — maps the rating string to `ts-fsrs`'s `Rating` enum (per "Critical Implementation Details"), calls `next(card, now, rating)`, and returns the updated scheduling fields (`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`) as a partial update — review-log output is discarded per "What We're NOT Doing".

#### 3. Study DTOs

**File**: `src/types.ts`

**Intent**: Define the due-cards and grade-submission contracts.

**Contract**: Add `DueCardsResponse` (`{ cards: Flashcard[] }`) and `SubmitReviewRequest` (`{ id: number; rating: "again" | "hard" | "good" | "easy" }`).

#### 4. Due-cards API route

**File**: `src/pages/api/study/due.ts`

**Intent**: Return the authenticated user's currently-due cards for one study session batch.

**Contract**: `export const prerender = false;` `GET` handler: 401 JSON if unauthenticated; `supabase.from("flashcards").select("*").lte("due", now).order("due").limit(20)` (RLS scopes to the caller automatically; the `(user_id, due)` index from F-01 covers this query); return `{ cards }`.

#### 5. Submit-review API route

**File**: `src/pages/api/study/review.ts`

**Intent**: Grade one card and persist its new scheduling state.

**Contract**: `export const prerender = false;` `POST` handler: 401 JSON if unauthenticated; load the target row scoped by RLS (a missing/foreign row naturally 404s via an empty select); compute the update via `scheduler.gradeCard`; `update(...).eq("id", id)`; return `{ ok: true }` or a 4xx/5xx with `{ error }`.

#### 6. Study session page

**File**: `src/pages/study.astro`

**Intent**: Host the study session island behind auth; add this path to protected routes.

**Contract**: Renders `<StudySession client:load />` inside `Layout`; add `"/study"` to `PROTECTED_ROUTES` in `src/middleware.ts`.

#### 7. Study session UI

**File**: `src/components/study/StudySession.tsx`

**Intent**: Drive one-card-at-a-time review: fetch the due batch, show the question, reveal the answer on demand, collect a 4-button grade, submit, advance, and show a completion state when the batch is exhausted.

**Contract**: On mount, `GET /api/study/due`; local state tracks the current index and a `revealed` flag; "Show answer" reveals the answer and the four rating buttons (Again/Hard/Good/Easy); selecting one calls `POST /api/study/review`; on success, advances to the next card; on failure, shows an inline error with a retry action and does not advance until the grade succeeds; when the batch is exhausted (or was empty), shows a "Nothing due right now" / "Session complete" state with a link back to `/dashboard`.

#### 8. Navigation entry point

**File**: `src/components/Topbar.astro`

**Intent**: Give signed-in users a way to reach the study session.

**Contract**: Add a `/study` link alongside the `/flashcards/new` link added in Phase 2.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With at least one saved flashcard due (default `due = now()` from Phase 2's insert makes new cards immediately due), `/study` shows it.
- Revealing the answer and grading with each of the four ratings updates the row's `due`/`stability`/`difficulty`/`state`/`reps`/`last_review` plausibly (spot-check via Studio/`psql`: e.g. "Again" schedules sooner and increments `lapses` when the prior state was Review; "Easy" schedules further out).
- After grading every due card, the session shows a completion state instead of erroring or looping.
- Visiting `/study` with zero due cards shows the empty state, not an error.
- Attempting to reach `/study` while signed out redirects to `/auth/signin`.

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this repo; per the confirmed decision, AI-response parsing and the FSRS scheduling wrapper are verified manually rather than introducing new tooling mid-slice.

### Integration Tests:

- None automated; covered by each phase's manual verification.

### Manual Testing Steps:

1. Configure `OPENROUTER_API_KEY` locally and confirm `/api/flashcards/generate` returns valid candidates for representative source text.
2. Walk through the full UI flow: paste text → review (accept some, reject some, edit one) → save → confirm the right rows land in `public.flashcards` with correct `source`/`was_edited`.
3. Confirm input-length and auth guards reject bad requests on both the generate and save endpoints.
4. Start a study session, grade several cards across all four ratings, and confirm scheduling fields update plausibly after each.
5. Confirm the "no cards due" and "session complete" empty states render correctly.
6. Confirm `/flashcards/new` and `/study` both redirect signed-out visitors to `/auth/signin`.
7. Run `npx astro check`, `npm run lint`, and `npm run build` after each phase.

## Performance Considerations

The due-cards query reuses F-01's `(user_id, due)` index — no new index is needed. The generation route's latency is bounded by OpenRouter's response time, which this plan does not attempt to optimize beyond requesting structured output (avoids CPU-heavy regex parsing); the documented Cloudflare Workers CPU-cap risk is accepted per the confirmed decision, mitigated at the infrastructure level (paid plan) rather than in this code.

## Migration Notes

Not applicable — no schema changes in this plan; F-01's `flashcards` table already has every column this slice needs.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (US-01, FR-001–FR-004, FR-009, NFRs)
- Infrastructure: `context/foundation/infrastructure.md` (OpenRouter provider choice, Cloudflare Workers CPU-cap risk)
- Prior change: `context/changes/flashcards-data-foundation/plan.md` (F-01 — schema this slice builds on)
- Change notes: `context/changes/ai-generate-review-study-loop/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: AI Generation Backend

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — fe84e1f
- [x] 1.2 Linting passes: `npm run lint` — fe84e1f
- [x] 1.3 Production build succeeds: `npm run build` — fe84e1f

#### Manual

- [x] 1.4 Valid authenticated request to `/api/flashcards/generate` returns non-empty valid candidates — fe84e1f
- [x] 1.5 Under/over length input returns 400 — fe84e1f
- [x] 1.6 Unauthenticated request returns 401 — fe84e1f
- [x] 1.7 Unconfigured `OPENROUTER_API_KEY` returns a clear error and shows the sitewide config banner — fe84e1f

### Phase 2: Review UI & Save

#### Automated

- [x] 2.1 Type checking passes: `npx astro check` — 17b0ea6
- [x] 2.2 Linting passes: `npm run lint` — 17b0ea6
- [x] 2.3 Production build succeeds: `npm run build` — 17b0ea6

#### Manual

- [x] 2.4 Paste + submit shows generated candidates — 17b0ea6
- [x] 2.5 Accept/reject toggling works per candidate — 17b0ea6
- [x] 2.6 Edit dialog updates candidate text and marks it edited — 17b0ea6
- [x] 2.7 Save persists only accepted candidates with correct `source`/`was_edited` — 17b0ea6
- [x] 2.8 Signed-out visit to `/flashcards/new` redirects to sign-in — 17b0ea6

### Phase 3: Spaced-Repetition Study Session

#### Automated

- [x] 3.1 Type checking passes: `npx astro check` — 7219ae4
- [x] 3.2 Linting passes: `npm run lint` — 7219ae4
- [x] 3.3 Production build succeeds: `npm run build` — 7219ae4

#### Manual

- [x] 3.4 Due card(s) appear in a study session — 7219ae4
- [x] 3.5 Grading with each of the four ratings updates scheduling fields plausibly — 7219ae4
- [x] 3.6 Session-complete state shows after all due cards are graded — 7219ae4
- [x] 3.7 Empty state shows when zero cards are due — 7219ae4
- [x] 3.8 Signed-out visit to `/study` redirects to sign-in — 7219ae4
