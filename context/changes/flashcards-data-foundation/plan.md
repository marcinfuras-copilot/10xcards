# Flashcards Data Foundation Implementation Plan

## Overview

Create the `flashcards` table — the single foundation every vertical slice (S-01, S-02, S-03) builds on — as a Supabase migration with per-user row-level security, FSRS-shaped spaced-repetition scheduling fields, and source/edit tracking, then wire generated TypeScript types into the codebase.

## Current State Analysis

- No `supabase/migrations/` files exist — this repo has never had an application table, only Supabase Auth's built-in `auth.users`.
- No `src/types.ts` exists yet (`CLAUDE.md` names it as the convention for shared entity/DTO types, but nothing has needed it until now).
- `src/lib/supabase.ts` creates an untyped `createServerClient` — no `Database` generic is passed anywhere in the codebase.
- No SR library (`ts-fsrs` or otherwise) is in `package.json` yet; FR-009 requires an existing, non-custom algorithm but nothing has picked one until this plan.
- No test runner is configured (`CLAUDE.md`): RLS verification for this change is manual, not automated.

## Desired End State

A `flashcards` table exists in `public`, with RLS enabled and forced, four per-operation policies scoping every row to its owner via `auth.uid()`, and typed access available from application code via `src/types.ts`. This unblocks planning for S-01/S-02/S-03 — none of which need a further schema change to start.

**Verification**: `npx supabase db reset` applies the migration cleanly against a fresh local database; two manually-created test accounts each see and can only mutate their own rows when queried through the Supabase client; `npm run lint` and `npx astro check` pass with the new types in place.

### Key Discoveries:

- `CLAUDE.md` already mandates granular per-operation, per-role RLS policies as the sole enforcement point (not app-layer checks) — this isn't a decision for this plan, it's a constraint to follow.
- `ts-fsrs`'s `Card` shape (`due`, `stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`, `last_review`) maps directly onto Postgres columns with no translation layer, so choosing it now (rather than a generic JSONB blob) avoids a follow-up migration when S-01 wires up the actual study session.
- Supabase Postgres best practices (loaded via the `supabase-postgres-best-practices` skill) recommend: `bigint generated always as identity` over UUID v4 for primary keys (avoids index fragmentation), `text` over `varchar(n)`, `timestamptz` over `timestamp`, wrapping `auth.uid()` in a `(select ...)` inside RLS policies (evaluated once per query instead of once per row), and indexing every column an RLS policy filters on.

## What We're NOT Doing

- Not implementing the AI generation call, the review UI, the manual-creation form, or the study session UI — those are S-01/S-02/S-03.
- Not adding the `ts-fsrs` npm package as a runtime dependency — this migration only shapes the schema to match its `Card` interface; the library itself is installed and invoked when S-01 builds the actual scheduling logic.
- Not building automated RLS tests (pgTAP, vitest harness) — verification for this foundation change is manual, per the confirmed decision.
- Not adding soft-delete (`deleted_at`) — deletes are hard deletes, per the confirmed decision.
- Not pre-designing fields for hypothetical future needs beyond what S-01/S-02/S-03 already require, per the roadmap's explicit minimalism note.

## Implementation Approach

One migration file creates the table, its constraints, an index, an `updated_at` trigger, and RLS policies in a single transaction (Supabase migrations run each file transactionally by default). A second phase generates TypeScript types from the live schema and threads them through the existing Supabase client factory and a new `src/types.ts`.

## Critical Implementation Details

### State sequencing

Enable RLS, add all four policies, and only then run `FORCE ROW LEVEL SECURITY` — in that exact order within the same migration file. If `FORCE` is applied before policies exist, any manual verification query run as the table owner (e.g. via the Studio SQL editor while testing) will unexpectedly return zero rows, which is easy to misdiagnose as a broken policy rather than an ordering artifact.

## Phase 1: Schema & RLS Migration

### Overview

Create `public.flashcards` with all scheduling, content, and tracking fields, its constraints and index, an `updated_at` trigger, and per-operation RLS policies.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260822203058_create_flashcards.sql`

**Intent**: Define the full schema in one migration — table, constraints, trigger, index, and RLS — so this foundation change ships as a single atomic unit that S-01/S-02/S-03 can all depend on.

**Contract**:

```sql
create table public.flashcards (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- content
  question text not null check (char_length(question) between 1 and 500),
  answer text not null check (char_length(answer) between 1 and 2000),

  -- provenance (PRD success metrics: % AI-generated, edit rate)
  source text not null check (source in ('ai', 'manual')),
  was_edited boolean not null default false,

  -- FSRS scheduling state (matches ts-fsrs's Card shape 1:1)
  due timestamptz not null default now(),
  stability real not null default 0,
  difficulty real not null default 0,
  elapsed_days integer not null default 0,
  scheduled_days integer not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  state smallint not null default 0 check (state between 0 and 3), -- ts-fsrs State enum: 0=New,1=Learning,2=Review,3=Relearning
  last_review timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index flashcards_user_due_idx on public.flashcards (user_id, due);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger flashcards_set_updated_at
  before update on public.flashcards
  for each row
  execute function public.set_updated_at();

alter table public.flashcards enable row level security;

create policy flashcards_select_own on public.flashcards
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy flashcards_insert_own on public.flashcards
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy flashcards_update_own on public.flashcards
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy flashcards_delete_own on public.flashcards
  for delete to authenticated
  using ((select auth.uid()) = user_id);

alter table public.flashcards force row level security;
```

### Success Criteria:

#### Automated Verification:

- Local Supabase resets and applies the migration cleanly: `npx supabase db reset`
- `psql` (or Studio SQL editor) confirms RLS is enabled and forced on `public.flashcards`: `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'flashcards';` returns `t, t`
- Linting passes: `npm run lint`

#### Manual Verification:

- Create two test accounts (Studio → Authentication, or sign up via `/auth/signup`); insert one flashcard row per user (via SQL editor as each user's JWT, or via `supabase.auth.signInWithPassword` + `supabase.from('flashcards').insert(...)` in a scratch script).
- Confirm each user's authenticated client can `select`/`update`/`delete` only their own row, and inserting a row with someone else's `user_id` is rejected.
- Confirm deleting one test user (Studio → Authentication → delete user) cascades and removes their flashcard row.

---

## Phase 2: TypeScript Types

### Overview

Generate types from the live schema and make them available to application code per the `src/types.ts` convention.

### Changes Required:

#### 1. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Keep the canonical Postgres↔TypeScript mapping machine-generated and in sync with the migration, rather than hand-maintained.

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts`, run after `npx supabase db reset` has applied Phase 1's migration locally.

#### 2. Shared entity types

**File**: `src/types.ts`

**Intent**: Expose an app-facing `Flashcard` entity type (and the `FsrsState` enum matching the `state` column's 0–3 values) derived from the generated `Database` type, per `CLAUDE.md`'s "shared types go in `src/types.ts`" convention.

**Contract**: `export type Flashcard = Database["public"]["Tables"]["flashcards"]["Row"];` (plus `Insert`/`Update` variants as needed) re-exported from `src/types.ts`, importing `Database` from `./db/database.types`.

#### 3. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Thread the generated `Database` type through `createServerClient` so all future `supabase.from('flashcards')` calls are typed end-to-end.

**Contract**: `createServerClient<Database>(...)` — same function signature, one added type parameter.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `Database["public"]["Tables"]["flashcards"]["Row"]` in an editor shows all columns from Phase 1's migration with correct types (spot-check `state` is `number`, `due`/`last_review` are `string`, `source` is `string`).

---

## Testing Strategy

### Unit Tests:

- None — no test runner is configured in this repo yet, and adding RLS test infrastructure was explicitly deferred (see What We're NOT Doing).

### Integration Tests:

- None automated; covered by Phase 1's manual two-account verification.

### Manual Testing Steps:

1. Reset local Supabase and confirm the migration applies with no errors.
2. Create two test accounts and one flashcard row per account.
3. Confirm cross-user reads/writes are rejected and own-user reads/writes succeed.
4. Delete one test account and confirm its flashcard row is gone (cascade).
5. Run `npx astro check`, `npm run lint`, and `npm run build` after Phase 2's type changes.

## Performance Considerations

The `(user_id, due)` composite index covers both "list my flashcards" (leftmost-prefix on `user_id`) and "give me my due cards" (`user_id` + `due <= now()`) query shapes that S-01 and S-03 will need — no additional index is required for this foundation.

## Migration Notes

Not applicable — this is a net-new table with no existing data to migrate.

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (Access Control, data-retention NFR, FR-009)
- Change notes: `context/changes/flashcards-data-foundation/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS Migration

#### Automated

- [x] 1.1 Local Supabase resets and applies the migration cleanly: `npx supabase db reset` — eeb3a0c
- [x] 1.2 RLS is enabled and forced on `public.flashcards` — eeb3a0c
- [x] 1.3 Linting passes: `npm run lint` — eeb3a0c

#### Manual

- [x] 1.4 Two test accounts each see/mutate only their own flashcard row; cross-user writes rejected — eeb3a0c
- [x] 1.5 Deleting a test user cascades and removes their flashcard row — eeb3a0c

### Phase 2: TypeScript Types

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Production build succeeds: `npm run build`

#### Manual

- [x] 2.4 Generated `Flashcard` row type matches Phase 1's migration columns
