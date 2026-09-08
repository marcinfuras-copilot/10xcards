# Flashcard Management List — Plan Brief

> Full plan: `context/changes/flashcard-management-list/plan.md`

## What & Why

Let a user browse their saved flashcards, edit one, and delete one (PRD FR-006/007/008). It's the last of the three F-01-dependent slices — the place a user goes to see, fix, or remove what AI generation (S-01) and manual creation (S-02) have accumulated.

## Starting Point

There is no way to view a flashcard once saved outside of a study session. No list, edit, or delete endpoint exists anywhere in the codebase — only `POST` (create) endpoints exist for the two creation flows. RLS already grants select/update/delete scoped to the owning user (from F-01), so no schema change is needed.

## Desired End State

A logged-in user visits `/flashcards`, sees all their cards newest-first with question + truncated answer, and can edit or delete any card via a dialog — both actions update the list instantly without a page reload. A user with zero cards sees an empty state linking to both creation flows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| List UI | Dedicated `/flashcards` page, question + truncated answer per row | Consistent with existing routing convention; scanning many questions is the primary browsing use case | Plan |
| Edit UX | Modal dialog, same pattern as `EditCandidateDialog` | Maximum consistency with existing UX; near-direct adaptation of code that already works | Plan |
| Delete UX | Confirmation dialog before deleting | Prevents accidental, irreversible data loss (`on delete cascade`) | Plan |
| Empty state | Friendly message + links to both creation paths | Actively guides a new user toward the two ways to create cards | Plan |
| Sort order | Newest first (`created_at` descending) | Matches "what did I just add" mental model right after a generate/create session | Plan |
| Post-action UX | Optimistic local state update, no refetch | Instant feedback; matches the codebase's existing pattern of managing lists as local React state | Plan |
| Nav | Add "My flashcards" to Topbar | Consistent with how every other flashcard feature is surfaced | Plan |
| API shape | New `GET` on `/api/flashcards`, new dynamic `/api/flashcards/[id]` for `PATCH`/`DELETE` | First dynamic API route in the repo, but Astro supports it natively; keeps per-id operations separate from the existing batch/single-create endpoints | Plan |

## Scope

**In scope:** list endpoint, per-id edit/delete endpoints, list page with edit/delete dialogs, empty state, nav link.

**Out of scope:** search/filter/pagination, bulk actions, undo-after-delete, any change to AI generation/manual creation/study flows.

## Architecture / Approach

Add the three missing HTTP operations first (`GET` list, `PATCH` edit, `DELETE`), each following the existing auth → validate → Supabase call → typed response shape already established. Then build the list page as one React island managing its own array of flashcards in local state, patching that state directly after a successful edit or delete.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. List, edit, delete API | `GET /api/flashcards`, `PATCH`/`DELETE /api/flashcards/[id]` | Low — mirrors existing insert/select patterns; RLS already handles ownership scoping |
| 2. Flashcard list UI | `/flashcards` page, edit dialog, delete dialog, nav link | Low — mirrors existing dialog/list patterns from S-01/S-02 |

**Prerequisites:** F-01 (flashcards schema + RLS) — already implemented.
**Estimated effort:** ~1-2 sessions across 2 phases.

## Open Risks & Assumptions

- None — RLS already covers select/update/delete scoping; this is the first dynamic (`[id]`) API route in the repo but Astro supports it with no config changes.

## Success Criteria (Summary)

- A signed-in user can see all their flashcards, edit any one, and delete any one, with changes reflected immediately and persisting across reload.
- A user only ever sees, edits, or deletes their own flashcards (RLS-enforced 404 on cross-user access attempts).
