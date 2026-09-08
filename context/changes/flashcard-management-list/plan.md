# Flashcard Management List Implementation Plan

## Overview

Let a user browse all their saved flashcards, edit one in place, and delete one (FR-006/007/008). This is the last of the three F-01-dependent vertical slices — AI generation (S-01) and manual creation (S-02) both already create flashcards; this slice is where a user goes to see, fix, or remove what's accumulated.

## Current State Analysis

There is currently no way to see a flashcard once it's saved outside of a study session. `src/pages/api/flashcards/index.ts` only exports `POST` (AI batch save); `src/pages/api/flashcards/manual.ts` only exports `POST` (single manual save). No `GET` (list), `PATCH` (edit), or `DELETE` endpoint exists anywhere. No dynamic (`[id]`) API route exists yet in this codebase — this plan introduces the first one.

### Key Discoveries:

- RLS already grants everything this slice needs: `flashcards_select_own`, `flashcards_update_own`, and `flashcards_delete_own` policies (`supabase/migrations/20260822203058_create_flashcards.sql`) are all scoped to `auth.uid() = user_id` and already exist — no migration needed.
- Astro supports multiple HTTP-method exports per route file and file-based dynamic routes (`[id].ts`) with no config changes; `output: "server"` (already set) serves them SSR like any other route.
- `EditCandidateDialog.tsx` (`src/components/flashcards/EditCandidateDialog.tsx`) is a near-direct template for the edit dialog: same field-level validation (required, 500/2000 char max, live counters), same `Dialog`/`DialogContent`/`DialogFooter` composition — it just needs to carry a flashcard `id` and call the new PATCH endpoint instead of an in-memory `onSave` callback.
- `ui/button.tsx` already has a `destructive` variant, ready for the delete-confirmation dialog's confirm button.
- The `.insert(row).select().single()` pattern already used in `src/pages/api/flashcards/manual.ts` extends naturally to `.update(...).eq("id", id).select().single()` and `.delete().eq("id", id).select()` — in both cases an empty/missing result distinguishes "not found or not yours" (RLS silently filters it) from success, without needing a separate ownership check in application code.
- `StudySession.tsx`'s empty-state pattern (message + link back to a hub page) is the template for this list's empty state, extended to link to both flashcard-creation entry points per the planning decision below.

## Desired End State

A logged-in user visits `/flashcards`, sees all their flashcards (newest first) with each row showing the question and a truncated answer preview. From there they can open an edit dialog to change a card's question/answer, or open a delete-confirmation dialog to remove a card — both update the list immediately without a full reload. A user with zero flashcards sees a friendly empty state linking to `/flashcards/new` (AI generation) and `/flashcards/manual`.

Verification: create a couple of flashcards (via either existing creation path), see them listed at `/flashcards`, edit one and confirm the change persists (reload the page), delete one and confirm it's gone (reload the page), confirm RLS still scopes the list to the signed-in user only.

## What We're NOT Doing

- No search, filter, or pagination UI — PRD scopes this to "a simple list" and the target data volume is small.
- No bulk actions (select multiple, bulk delete).
- No undo-after-delete — the confirmation dialog is the only safety net, matching the DB's `on delete cascade` semantics (irreversible once confirmed).
- No changes to the AI generation, manual creation, or study flows.

## Implementation Approach

Add the three missing HTTP operations first (list, edit, delete), each following the existing auth-check → validate → Supabase call → typed response shape already established in `src/pages/api/flashcards/{index,manual}.ts`. Then build the list page as a single React island managing its own array of flashcards in local state, patching that state directly after a successful edit or delete (no refetch), mirroring how `ReviewSession.tsx` already manages its `candidates` array.

## Phase 1: List, edit, and delete API

### Overview

The three missing HTTP operations on the `flashcards` resource: list all of the current user's cards, update one by id, delete one by id.

### Changes Required:

#### 1. List endpoint

**File**: `src/pages/api/flashcards/index.ts`

**Intent**: Add a `GET` export alongside the existing `POST` that returns all of the authenticated user's flashcards, newest first.

**Contract**: `export const GET: APIRoute` — 401 if no `context.locals.user`; on success, `supabase.from("flashcards").select("*").order("created_at", { ascending: false })`; 500 on Supabase error or missing client; response `{ flashcards: Flashcard[] } satisfies ListFlashcardsResponse` at 200.

#### 2. Edit and delete endpoint

**File**: `src/pages/api/flashcards/[id].ts`

**Intent**: A new dynamic route handling `PATCH` (update question/answer) and `DELETE` (remove) for a single flashcard by id, scoped to the owning user via RLS.

**Contract**:
- `export const prerender = false;`
- Shared id parsing: `Number(context.params.id)`; 400 if not a positive integer.
- `PATCH`: 401 if unauthenticated. Body `UpdateFlashcardRequest = { question: string; answer: string }`, validated with the same `QUESTION_MAX_LENGTH`/`ANSWER_MAX_LENGTH` rules as `manual.ts` (400 on invalid). `supabase.from("flashcards").update({ question, answer }).eq("id", id).select().single()`; a Supabase "no rows" error (RLS filtered it out, or the id doesn't exist) maps to 404 rather than 500; success returns `{ flashcard: Flashcard } satisfies UpdateFlashcardResponse` at 200. Does not touch `source` or `was_edited` — those describe provenance from creation time, not post-save edits.
- `DELETE`: 401 if unauthenticated. `supabase.from("flashcards").delete().eq("id", id).select()`; an empty returned array means nothing was deleted (not found or not owned) → 404; otherwise 200 with `{ ok: true } satisfies DeleteFlashcardResponse`.

#### 3. Shared request/response types

**File**: `src/types.ts`

**Intent**: Add the request/response types the new endpoints and UI share, following the existing pattern in this file.

**Contract**: Add `ListFlashcardsResponse { flashcards: Flashcard[] }`, `UpdateFlashcardRequest { question: string; answer: string }`, `UpdateFlashcardResponse { flashcard: Flashcard }`, `DeleteFlashcardResponse { ok: true }`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- GET /api/flashcards with a valid session returns all of that user's cards, newest first, and none of another user's cards
- PATCH /api/flashcards/:id with a valid session and body updates the row and returns it; PATCH on another user's id or a nonexistent id returns 404
- DELETE /api/flashcards/:id with a valid session removes the row; DELETE on another user's id or a nonexistent id returns 404
- Both endpoints return 401 when unauthenticated

---

## Phase 2: Flashcard list UI

### Overview

The `/flashcards` page: a list of the user's cards with per-row edit and delete actions, backed by the Phase 1 API.

### Changes Required:

#### 1. Edit dialog

**File**: `src/components/flashcards/EditFlashcardDialog.tsx`

**Intent**: An id-aware sibling of `EditCandidateDialog.tsx` — same question/answer fields, validation, and dialog chrome, but it calls `PATCH /api/flashcards/:id` itself (rather than an in-memory `onSave` callback) and reports the updated flashcard back to the list on success.

**Contract**: Props: `open`, `onOpenChange`, `flashcard: Flashcard`, `onSaved: (updated: Flashcard) => void`. Internally POSTs (PATCHes) to `/api/flashcards/${flashcard.id}` using `UpdateFlashcardRequest`/`UpdateFlashcardResponse`, shows a `ServerError` on failure, calls `onSaved` and closes on success.

#### 2. Delete confirmation dialog

**File**: `src/components/flashcards/DeleteFlashcardDialog.tsx`

**Intent**: A confirmation dialog ("Delete this flashcard? This can't be undone.") that calls `DELETE /api/flashcards/:id` on confirm.

**Contract**: Props: `open`, `onOpenChange`, `flashcard: Flashcard`, `onDeleted: (id: number) => void`. Confirm button uses the `destructive` Button variant; on success calls `onDeleted(flashcard.id)` and closes; shows `ServerError` on failure.

#### 3. Flashcard list component

**File**: `src/components/flashcards/FlashcardList.tsx`

**Intent**: Fetches `GET /api/flashcards` on mount, renders each card (question + truncated answer preview) with Edit/Delete buttons, manages the two dialogs above, and patches its local array in place after a successful edit or delete — no refetch. Shows a friendly empty state (matching `StudySession.tsx`'s empty-state pattern) linking to `/flashcards/new` and `/flashcards/manual` when the list is empty.

**Contract**: Default export, no props, `Status = "loading" | "empty" | "ready"`. State: `flashcards: Flashcard[]`, `editingId`/`deletingId` (or the flashcard objects themselves) to drive the two dialogs, `error: string | null`. On dialog success: `setFlashcards(prev => ...)` — replace the edited row in place, or filter out the deleted row's id.

#### 4. List page

**File**: `src/pages/flashcards/index.astro`

**Intent**: Page shell hosting the list, following the same `Layout` + `Topbar` + glass-card wrapper structure as `flashcards/new.astro` and `flashcards/manual.astro`.

**Contract**: Renders `Layout` (title "My flashcards"), `Topbar`, and `<FlashcardList client:load />`.

#### 5. Nav link

**File**: `src/components/Topbar.astro`

**Intent**: Add a "My flashcards" link to the authenticated nav.

**Contract**: New `<a href="/flashcards">My flashcards</a>` inserted into the existing authenticated-user link list, styled identically to the adjacent links.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Signed in, clicking "My flashcards" in the Topbar navigates to `/flashcards` and lists all of that user's cards, newest first
- With zero flashcards, the empty state shows and its links to `/flashcards/new` and `/flashcards/manual` work
- Editing a card via the dialog updates it in the list immediately (no reload) and the change persists across a page reload
- Deleting a card via the confirmation dialog removes it from the list immediately (no reload) and it stays gone across a page reload
- Signed-out visit to `/flashcards` redirects per the existing `/flashcards` protected-route prefix in `src/middleware.ts`

---

## Testing Strategy

### Unit Tests:

No test runner is configured in this repo (per `CLAUDE.md`); verification relies on the automated checks (typecheck/lint/build) and manual testing above.

### Manual Testing Steps:

1. Sign in, navigate to `/flashcards` via the new Topbar link.
2. With no flashcards yet, confirm the empty state and that both its links work.
3. Create a couple of flashcards (via `/flashcards/new` or `/flashcards/manual`), return to `/flashcards`, confirm they appear newest-first.
4. Edit a card's question and answer via the dialog; confirm the row updates immediately, then reload the page to confirm it persisted.
5. Delete a card via the confirmation dialog; confirm it disappears immediately, then reload the page to confirm it's actually gone.
6. Attempt to PATCH/DELETE another user's flashcard id (e.g. via a raw HTTP request) and confirm 404, not 200 or 500.
7. Sign out and visit `/flashcards` directly; confirm the middleware redirects to sign-in.

## Performance Considerations

None beyond a single unfiltered `select("*")` scoped by RLS on an indexed table — acceptable at the PRD's stated small target data volume.

## Migration Notes

No schema migration needed — RLS policies for select/update/delete already exist from F-01.

## References

- Related roadmap item: `context/foundation/roadmap.md`, S-03
- Existing single-row insert pattern to mirror: `src/pages/api/flashcards/manual.ts`
- Existing dialog/validation pattern to mirror: `src/components/flashcards/EditCandidateDialog.tsx`
- Existing empty-state pattern to mirror: `src/components/study/StudySession.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: List, edit, and delete API

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — c12842f
- [x] 1.2 Linting passes: `npm run lint` — c12842f

#### Manual

- [x] 1.3 GET /api/flashcards returns only the current user's cards, newest first — c12842f
- [x] 1.4 PATCH /api/flashcards/:id updates and returns the row; 404 on another user's/nonexistent id — c12842f
- [x] 1.5 DELETE /api/flashcards/:id removes the row; 404 on another user's/nonexistent id — c12842f
- [x] 1.6 Both endpoints return 401 when unauthenticated — c12842f

### Phase 2: Flashcard list UI

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Build succeeds: `npm run build`

#### Manual

- [x] 2.4 Topbar "My flashcards" link navigates to `/flashcards` and lists cards newest-first
- [x] 2.5 Empty state shows with zero flashcards and its links work
- [x] 2.6 Editing a card updates the list immediately and persists across reload
- [x] 2.7 Deleting a card removes it from the list immediately and stays gone across reload
- [x] 2.8 Signed-out visit to `/flashcards` redirects per existing protected-route middleware
