# Manual Flashcard Creation — Plan Brief

> Full plan: `context/changes/manual-flashcard-creation/plan.md`

## What & Why

Add a manual flashcard creation path (PRD FR-005): a user can create a flashcard directly by typing a question and answer, without going through AI generation. This is the fallback path for topics AI generation handles poorly, and the PRD's 75%-via-AI success metric already implies ~25% of cards will be created this way.

## Starting Point

The `flashcards` table and RLS (F-01) and the AI generate → review → save → study loop (S-01) are both already implemented. The schema already anticipates this feature — `source` is a checked enum of `'ai' | 'manual'` — but no code path ever inserts `source = 'manual'`. The existing `POST /api/flashcards` endpoint only handles the AI-review batch-save shape.

## Desired End State

A logged-in user opens `/flashcards/manual` from the nav, types a question/answer, and saves it. The form clears and shows a success message so they can add several cards back-to-back. The card immediately shows up in a normal `/study` session like any other flashcard.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| API shape | New dedicated `POST /api/flashcards/manual` endpoint | Keeps the existing batch AI-save endpoint's contract untouched instead of overloading it with a single-card, no-`wasEdited` case | Plan |
| Entry point | Dedicated page `/flashcards/manual` + nav link | Consistent with the existing `/flashcards/new` (AI) and `/study` routing convention | Plan |
| Post-save UX | Clear form + inline success, stay on page | Optimized for adding several manual cards in a row, mirrors the rapid-entry feel of the AI review flow | Plan |
| Validation | Mirror `EditCandidateDialog`'s rules exactly | Same 500/2000 char limits already match the DB check constraints; proven pattern in this codebase | Plan |
| Form tech | React island (`ManualCreateForm.tsx`) | Consistent with the rest of the flashcards feature area, all of which is React/client-driven | Plan |

## Scope

**In scope:** manual-create API endpoint, form UI, nav link, end-to-end verification that manual cards are studyable.

**Out of scope:** editing/deleting/listing flashcards (S-03), batch manual entry, any change to the AI generation/review flow.

## Architecture / Approach

Mirrors the existing AI-generation vertical exactly (Astro page → React island → dedicated API route), but sized for a single card instead of a batch: `flashcards/manual.astro` → `ManualCreateForm.tsx` → `POST /api/flashcards/manual` → insert with `source: 'manual'`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Manual creation API | New endpoint + shared request/response types, inserts a `source='manual'` row | Low — mirrors an existing, working endpoint |
| 2. Manual creation UI | New page, form component, Topbar nav link | Low — mirrors existing page/component patterns |

**Prerequisites:** F-01 (flashcards schema + RLS) — already implemented.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- None — schema already supports `source = 'manual'`, and `/flashcards` is already a protected-route prefix in middleware, so no auth/schema work is needed.

## Success Criteria (Summary)

- A signed-in user can create a flashcard via `/flashcards/manual` without touching AI generation.
- The created card has `source = 'manual'`, passes RLS scoping, and appears in that user's `/study` queue.
