# Flashcards Data Foundation — Plan Brief

> Full plan: `context/changes/flashcards-data-foundation/plan.md`

## What & Why

Create the `flashcards` table with per-user row-level security — the single data foundation that every vertical slice (S-01 AI generate/review/study, S-02 manual creation, S-03 list/edit/delete) needs before it can be planned or implemented. Nothing beyond auth exists in the database today.

## Starting Point

No `supabase/migrations/` exist yet — this is the first application table in the project. No SR library is installed, no `src/types.ts` exists, and the Supabase client (`src/lib/supabase.ts`) is untyped.

## Desired End State

A `flashcards` table exists in Postgres with RLS enabled and forced, four per-operation policies scoping every row to its owner, and a generated TypeScript `Flashcard` type available from `src/types.ts`. S-01/S-02/S-03 can all start planning without needing a further schema change.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| SR scheduling field shape | Target `ts-fsrs`'s `Card` shape directly (due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review) | Modern, actively-maintained, TypeScript-native library; mapping 1:1 avoids a follow-up migration when S-01 wires up real scheduling | Plan |
| Source/edit tracking | Add `source` ('ai'\|'manual') + `was_edited` now | Unblocks the PRD's 75%-AI and edit-quality success metrics without a later migration | Plan |
| RLS verification | Manual two-account test only | No test runner exists yet in this repo; automated RLS tests would add new tooling for a minimal foundation change | Plan |
| Delete behavior | `ON DELETE CASCADE` from `auth.users` | Matches the PRD's flat, per-user-owned data model; no orphaned rows | Plan |
| Content constraints | `CHECK` length limits (question ≤500, answer ≤2000, non-empty) | Guards against pathological AI output at the one place all writes must pass through | Plan |
| New-card due date | `due = now()` at insert | Standard "new cards start due" SR convention; matches `ts-fsrs`'s own default state | Plan |
| Delete type (FR-008) | Hard delete, no `deleted_at` | Simplest schema; PRD has no retention requirement for deleted cards | Plan |
| Primary key | `bigint generated always as identity` | Supabase/Postgres best practice — avoids UUIDv4 index fragmentation | Plan |

## Scope

**In scope:**
- One migration: `flashcards` table, constraints, `(user_id, due)` index, `updated_at` trigger, RLS policies
- Generated `src/db/database.types.ts` + `Flashcard` entity type in `src/types.ts`
- Typed Supabase client generic

**Out of scope:**
- The `ts-fsrs` npm dependency and actual scheduling logic (S-01)
- AI generation, review UI, manual-creation form, study session UI (S-01/S-02/S-03)
- Automated RLS tests (pgTAP/vitest) — no test runner exists yet
- Soft delete / `deleted_at`

## Architecture / Approach

A single transactional Supabase migration creates the table with FSRS-shaped columns so the schema needs no follow-up change when S-01 implements real scheduling. RLS policies wrap `auth.uid()` in `(select ...)` per Supabase's documented performance guidance, and `FORCE ROW LEVEL SECURITY` is applied only after all four policies exist. A second phase generates TypeScript types from the live schema and threads them through `src/types.ts` and the existing Supabase client factory.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema & RLS Migration | `flashcards` table, constraints, index, trigger, RLS policies | Policy/ordering mistakes are only caught by manual two-account testing, not automated tests |
| 2. TypeScript Types | Generated `Database` type, `Flashcard` entity type, typed Supabase client | None significant — mechanical codegen step |

**Prerequisites:** None — auth already exists in the codebase, providing `auth.users` to key RLS on.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Targeting `ts-fsrs`'s exact field shape assumes S-01 will actually adopt `ts-fsrs` as the SR library; if S-01 later picks a different algorithm, a follow-up migration would be needed (accepted risk — still cheaper than a generic JSONB column per the roadmap's own risk note).
- Manual-only RLS verification means a future refactor could silently break policy isolation with nothing to catch it automatically.

## Success Criteria (Summary)

- `npx supabase db reset` applies the migration cleanly; RLS is enabled and forced.
- Two independent test accounts can only see/mutate their own flashcard rows; deleting a user cascades their flashcards.
- `npx astro check`, `npm run lint`, and `npm run build` all pass with the new types wired in.
