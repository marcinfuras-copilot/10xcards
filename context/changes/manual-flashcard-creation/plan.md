# Manual Flashcard Creation Implementation Plan

## Overview

Add a manual flashcard creation path (FR-005) alongside the existing AI generation flow. A user can go directly to a form, type a question and answer, and save it — no source text, no AI candidates, no review step.

## Current State Analysis

The `flashcards` table (`supabase/migrations/20260822203058_create_flashcards.sql`) already anticipates this: `source text not null check (source in ('ai', 'manual'))`. F-01 and S-01 are both implemented — RLS, FSRS scheduling columns, and the AI generate → review → save loop all exist. What's missing is any path that inserts a row with `source = 'manual'`.

`POST /api/flashcards` (`src/pages/api/flashcards/index.ts`) currently only supports the AI-review batch-save shape: it accepts `{ cards: [{question, answer, wasEdited}] }` and hard-codes `source: "ai"` on every insert. There is no UI or endpoint for a single manually-authored card.

### Key Discoveries:

- `EditCandidateDialog.tsx` (`src/components/flashcards/EditCandidateDialog.tsx:6-32`) already implements the exact validation this feature needs: required fields, live character counters, and the same 500/2000 max lengths as the DB check constraints (`question` 1-500 chars, `answer` 1-2000 chars). This is the template for the new form's field-level validation logic.
- `Topbar.astro` (`src/components/Topbar.astro:16-21`) is the single place nav links live for authenticated users — `Dashboard`, `Generate flashcards`, `Study`. A new `New flashcard` link belongs here.
- `src/types.ts` defines `FlashcardInsert` from the generated `Database` type — the new endpoint reuses this, no schema/type-generation change needed since `source: 'manual'` is already a valid enum value in the DB.
- `context.locals.user` (populated by `src/middleware.ts`) is the established way API routes get the authenticated user; `createClient(context.request.headers, context.cookies)` is the established way they get a Supabase client, including the null-check for "Supabase not configured" (see `src/pages/api/flashcards/index.ts:41-44`).

## Desired End State

A logged-in user can navigate to `/flashcards/manual`, type a question and answer, and save it as a flashcard with `source = 'manual'`. The form clears and shows an inline success confirmation after each save, letting the user add several cards back-to-back without leaving the page. The card is immediately eligible for study via the existing `/api/study/due` + `/study` flow (no changes needed there — new rows get the same FSRS defaults as any other flashcard).

Verification: create a flashcard via the new page, confirm it appears with `source = 'manual'` in Supabase Studio, and confirm it shows up in a study session.

## What We're NOT Doing

- No editing or deleting of existing flashcards (that's S-03, `flashcard-management-list`).
- No listing/browsing UI for flashcards (also S-03).
- No batch manual entry (one card per submit, matching the "add one, see it save, add the next" UX decided during planning).
- No changes to the AI generation/review flow or its endpoint.

## Implementation Approach

Mirror the existing AI-generation vertical (Astro page → React island → dedicated API route) exactly, but for a single card instead of a batch. A new, separate API route (`POST /api/flashcards/manual`) keeps the existing batch AI-save endpoint's contract untouched rather than overloading it with a single-card, no-`wasEdited` case.

## Phase 1: Manual creation API

### Overview

A new endpoint that validates and inserts one manually-authored flashcard.

### Changes Required:

#### 1. Manual create endpoint

**File**: `src/pages/api/flashcards/manual.ts`

**Intent**: Accept a single `{question, answer}` pair from an authenticated user and insert it as a flashcard with `source: 'manual'`, `was_edited: false`. Follow the same shape as `src/pages/api/flashcards/index.ts` (auth check → JSON parse → field validation → Supabase client → insert → typed response), reusing the same `QUESTION_MAX_LENGTH`/`ANSWER_MAX_LENGTH` constants and validation semantics (trim-independent, required, max length) as that file and as `EditCandidateDialog.tsx`.

**Contract**:
- `export const prerender = false;`
- `POST` handler, returns 401 if `context.locals.user` is absent.
- Request body: `CreateManualFlashcardRequest = { question: string; answer: string }`. 400 on invalid JSON or a question/answer that's empty or over the max length.
- Response: `CreateManualFlashcardResponse = { flashcard: Flashcard }` on success (200), matching the row actually inserted (so the UI can confirm exactly what was saved).
- Insert row: `{ question, answer, source: 'manual', was_edited: false, user_id: user.id }` via `FlashcardInsert`.
- 500 with `{ error: "Supabase is not configured" }` / `{ error: "Couldn't save flashcard" }` on the same failure paths as the existing endpoint.

#### 2. Shared request/response types

**File**: `src/types.ts`

**Intent**: Add the request/response types the new endpoint and form share, following the existing `SaveFlashcardsRequest`/`SaveFlashcardsResponse` pattern already in this file.

**Contract**: Add `CreateManualFlashcardRequest` and `CreateManualFlashcardResponse` interfaces as described above, placed alongside the other flashcard request/response types.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (Astro build runs `astro check` via the TS pipeline) — or `npx astro check` directly
- Linting passes: `npm run lint`

#### Manual Verification:

- `curl`/HTTP client POST to `/api/flashcards/manual` with a valid session cookie and `{"question": "Q", "answer": "A"}` returns 200 with the inserted row, and a Supabase Studio check shows `source = 'manual'`, `was_edited = false`
- POSTing without auth returns 401; POSTing an empty question or an answer over 2000 chars returns 400

---

## Phase 2: Manual creation UI

### Overview

A page and form that let a logged-in user reach the new endpoint, plus a nav link to find it.

### Changes Required:

#### 1. Manual create form component

**File**: `src/components/flashcards/ManualCreateForm.tsx`

**Intent**: A React island with `question`/`answer` textareas, live character counters and required/max-length validation matching `EditCandidateDialog.tsx`'s rules, a submit button that POSTs to `/api/flashcards/manual`, and an inline success/error state. On successful save, clear both fields and show a brief "Saved!" confirmation so the user can immediately add another card without navigating away.

**Contract**: Default export, no props (self-contained, like `ReviewSession.tsx`). Internal states: `question`, `answer`, `status: "idle" | "saving"`, `error: string | null`, `savedCount` (a running count of cards saved this session, shown in the success confirmation — e.g. "Saved! (3 so far)"). Uses `CreateManualFlashcardRequest`/`CreateManualFlashcardResponse` from `src/types.ts` and the same `parseErrorMessage` pattern used in `ReviewSession.tsx` for surfacing server errors.

#### 2. Manual create page

**File**: `src/pages/flashcards/manual.astro`

**Intent**: Page shell hosting the form, following `src/pages/flashcards/new.astro`'s structure exactly (`Layout` + `Topbar` + card container + `client:load` island).

**Contract**: Renders `Layout` (title "New flashcard"), `Topbar`, and `<ManualCreateForm client:load />` inside the same `bg-cosmic` / glass-card wrapper markup as `flashcards/new.astro`.

#### 3. Nav link

**File**: `src/components/Topbar.astro`

**Intent**: Add a "New flashcard" link to the authenticated nav so the page is reachable.

**Contract**: New `<a href="/flashcards/manual">New flashcard</a>` inserted into the existing authenticated-user link list (`src/components/Topbar.astro:13-21`), styled identically to the adjacent links.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Signed in, clicking "New flashcard" in the Topbar navigates to `/flashcards/manual`
- Submitting a valid question/answer saves the card, clears the form, and shows an inline success message; the field validation (required, length limits, live counters) matches `EditCandidateDialog`'s behavior
- The newly created card appears in a `/study` session (confirms FSRS defaults + RLS scoping work end-to-end for manually-created cards)
- Visiting `/flashcards/manual` while signed out redirects to `/auth/signin` — already covered by the `/flashcards` prefix in `PROTECTED_ROUTES` (`src/middleware.ts:4`), no middleware change needed

---

## Testing Strategy

### Unit Tests:

No test runner is configured in this repo (per `CLAUDE.md`); verification relies on the automated checks (typecheck/lint/build) and manual testing above.

### Manual Testing Steps:

1. Sign in, navigate to `/flashcards/manual` via the new Topbar link.
2. Submit a valid question/answer; confirm the form clears and shows a success message.
3. Submit again immediately to confirm the "add several in a row" flow works without a page reload.
4. Try an empty question, an empty answer, and an over-length answer; confirm client-side validation blocks submit with the same messaging style as `EditCandidateDialog`.
5. Check Supabase Studio: the new rows have `source = 'manual'`, `was_edited = false`, and correct `user_id`.
6. Go to `/study` and confirm a manually-created card appears in the due queue.
7. Sign out and attempt to visit `/flashcards/manual` directly; confirm the middleware redirects to sign-in (same as `/flashcards/new`).

## Performance Considerations

None beyond what the existing `/api/flashcards` endpoint already does — single-row insert on an indexed table.

## Migration Notes

No schema migration needed — `source = 'manual'` is already a valid value in the existing check constraint from F-01.

## References

- Related roadmap item: `context/foundation/roadmap.md`, S-02
- Existing AI-save endpoint (pattern to mirror): `src/pages/api/flashcards/index.ts`
- Existing validation pattern to mirror: `src/components/flashcards/EditCandidateDialog.tsx`
- Existing page pattern to mirror: `src/pages/flashcards/new.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Manual creation API

#### Automated

- [x] 1.1 Type checking passes: `npx astro check`
- [x] 1.2 Linting passes: `npm run lint`

#### Manual

- [x] 1.3 POST /api/flashcards/manual with valid session + valid body returns 200 and inserts a `source = 'manual'`, `was_edited = false` row
- [x] 1.4 POST without auth returns 401; invalid/oversized body returns 400

### Phase 2: Manual creation UI

#### Automated

- [ ] 2.1 Type checking passes: `npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Topbar "New flashcard" link navigates to `/flashcards/manual`
- [ ] 2.5 Valid submit saves, clears the form, and shows an inline success message; repeat submits work without reload
- [ ] 2.6 Client-side validation blocks empty/over-length question or answer with `EditCandidateDialog`-style messaging
- [ ] 2.7 Newly created manual card appears in a `/study` session
- [ ] 2.8 Signed-out visit to `/flashcards/manual` redirects per existing protected-route middleware
