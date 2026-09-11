---
date: 2026-09-12T00:25:54+02:00
researcher: marcinfuras-copilot
git_commit: c3ceaadff6ef192080f86ca145d7e5280339862f
branch: main
repository: marcinfuras-copilot/10xcards
topic: "Rollout Phase 1 (Critical-path coverage) — grounding Risks #1 (IDOR) and #2 (SR scheduling contract)"
tags: [research, codebase, authorization, rls, scheduler, ts-fsrs, vitest, test-plan]
status: complete
last_updated: 2026-09-12
last_updated_by: marcinfuras-copilot
---

# Research: Rollout Phase 1 — Critical-path coverage (IDOR + SR scheduling)

**Date**: 2026-09-12T00:25:54+02:00
**Researcher**: marcinfuras-copilot
**Git Commit**: c3ceaadff6ef192080f86ca145d7e5280339862f
**Branch**: main
**Repository**: marcinfuras-copilot/10xcards

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` ("Critical-path coverage") before planning:

- **Risk #1** — an authenticated user reads, edits, deletes, or grades another user's flashcard by calling an API route directly with that row's id (IDOR).
- **Risk #2** — grading a card produces scheduling fields that don't match the spaced-repetition algorithm's actual contract (wrong interval direction, missed lapse increment on failure).

For each: ground the real failure path in code, quote relevant lines, verify or correct the test-plan's response guidance, locate existing tests, identify the cheapest useful test layer, and flag speculative risks or misleading hot-spot evidence. Also survey what a from-scratch Vitest bootstrap needs (no test runner exists yet).

## Summary

Both risks are real, currently-unguarded gaps — not speculative.

- **Risk #1 (IDOR)**: every one of the 6 flashcard/study routes that read, write, delete, or grade a `flashcards` row relies **exclusively** on Postgres RLS (`auth.uid() = user_id`, with `force row level security`) for cross-user isolation. None add an app-layer `user_id` filter as defense-in-depth; all take the row `id` straight from the URL param or request body and query with it before any ownership check. This was manually verified once, with two seeded accounts, at the RLS-foundation stage ([`flashcards-data-foundation/plan.md:236`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/flashcards-data-foundation/plan.md#L236)) and asserted-as-a-design-property (not re-tested per route) in two later `impl-review.md`s. There is no automated regression guard for it anywhere. The test plan's response guidance (integration test, two seeded users, assert the cross-user 403/404 case) is correct and directly actionable — **no correction needed**.
- **Risk #2 (SR scheduling contract)**: the entire scheduling calculation is delegated to `ts-fsrs@5.4.2`'s `fsrs().next()`; the app's `src/lib/services/scheduler.ts` is a pure, zero-I/O field-mapping layer (`rowToCard` / `gradeCard`) with no test coverage. Verification today is a one-time manual spot-check documented in `ai-generate-review-study-loop/plan.md`. Decompiling the installed library's actual logic (`node_modules/ts-fsrs/dist/index.mjs`) confirms the exact invariant the plan wants tested: a rating of `Again` from `state = Review` is the only path that increments `lapses` and moves the card to `Relearning`; `Hard`/`Good`/`Easy` never increment lapses. The test plan's causal framing ("the installed SR library's card contract already changed once") is **slightly imprecise** — see Corrections below — but the underlying risk (an unverified library-contract assumption, caught only mid-implementation) is accurate and still stands.
- **Stack**: this is a genuine from-scratch bootstrap — zero test config, zero test files, zero test-related dependencies anywhere in the repo. `ts-fsrs` (already a runtime dep), `zod`, and a pure `scheduler.ts` make Risk #2 trivially unit-testable with no mocking. Risk #1 needs an integration layer against local Supabase (already configured, `supabase/config.toml`, 2 migrations) with two seeded users. `astro:env/server` is a virtual module Vitest won't resolve natively — any test importing `src/lib/supabase.ts` or `src/lib/services/openrouter.ts` needs it mocked/aliased.

## Detailed Findings

### Risk #1 — Authorization / IDOR

**Route inventory** (all under [`src/pages/api/`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api)) — every route uses the same SSR/cookie-bound client factory, `createClient` in [`src/lib/supabase.ts:6-24`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/lib/supabase.ts#L6-L24). **No service-role/admin client exists anywhere in the codebase** (repo-wide grep for `service_role`/`SERVICE_ROLE` found only the SSR factory and its call sites).

| Route | Op | Ownership mechanism | Gap |
|---|---|---|---|
| [`flashcards/index.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/flashcards/index.ts) GET (14-31) | list | RLS only — `.select("*")` with **no `.eq("user_id", ...)`** (line 25) | none for list (RLS scopes correctly); no defense-in-depth |
| `flashcards/index.ts` POST (46-83) | create | `user_id: user.id` set server-side from session (line 74), not from body | correct by construction |
| [`flashcards/manual.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/flashcards/manual.ts) POST (16-53) | create | same as above (line 44) | correct by construction |
| [`flashcards/[id].ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/flashcards/%5Bid%5D.ts) PATCH (22-65) | update | id from `context.params.id` (28) → `.update(...).eq("id", id)` (50-55), **no `user_id` filter** | 100% RLS-dependent; not-found vs not-yours indistinguishable (both → 404) |
| `flashcards/[id].ts` DELETE (67-92) | delete | id from params (73) → `.delete().eq("id", id)` (83), **no `user_id` filter** | same as PATCH |
| [`study/due.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/study/due.ts) GET (9-31) | list due | `.select("*").lte("due", ...)` (19-24), **no `user_id` filter** | 100% RLS-dependent |
| [`study/review.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/study/review.ts) POST (13-56) | grade | id from body (25-28) → select by id (35-39, **no `user_id` filter**) → `.update(update).eq("id", ...)` (50, **no `user_id` filter**) | 100% RLS-dependent |

`flashcards/generate.ts` only checks auth (21-24) and calls the OpenRouter service — it never touches the `flashcards` table, so it's not part of the IDOR surface.

**Middleware** — [`src/middleware.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/middleware.ts) (24 lines, quoted in full by the sub-agent) attaches only `context.locals.user` (line 11/13); it does **not** attach a Supabase client to locals (every route re-derives its own via `createClient(...)`), and `PROTECTED_ROUTES` (line 4: `/dashboard`, `/flashcards`, `/study`) covers page routes only — API routes are not gated by middleware at all; each does its own 401 check independently. Middleware performs zero row-level authorization logic.

**RLS policies** — [`supabase/migrations/20260822203058_create_flashcards.sql:45-64`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/supabase/migrations/20260822203058_create_flashcards.sql#L45-L64):

```sql
alter table public.flashcards enable row level security;

create policy flashcards_select_own on public.flashcards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy flashcards_insert_own on public.flashcards
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy flashcards_update_own on public.flashcards
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy flashcards_delete_own on public.flashcards
  for delete to authenticated using ((select auth.uid()) = user_id);

alter table public.flashcards force row level security;
```

`force row level security` closes the table-owner-role bypass. Table def: `user_id uuid not null references auth.users (id) on delete cascade` (line 3 of the same migration).

**Existing tests**: none. Repo-wide search for `*.test.ts`/`*.spec.ts`/`__tests__` returned zero hits.

**Prior review history** (all in still-active `context/changes/*`, nothing archived yet):
- [`flashcards-data-foundation/plan.md:204,236`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/flashcards-data-foundation/plan.md#L204) — the *only* place a live two-account cross-user probe was actually run and recorded ("Two test accounts each see/mutate only their own flashcard row; cross-user writes rejected — `eeb3a0c`"), and it was manual, one-time, at the RLS-foundation stage.
- [`flashcard-management-list/reviews/impl-review.md:90,94`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/flashcard-management-list/reviews/impl-review.md#L90) and [`manual-flashcard-creation/reviews/impl-review.md:60`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/manual-flashcard-creation/reviews/impl-review.md#L60) — later reviews assert "RLS-scoped client, ownership delegated to RLS" as a *design property* by reading the code, not by re-running a live cross-user attack against `[id].ts` or `study/review.ts`.

**Verdict on test-plan §2 Risk Response Guidance for #1**: accurate, no correction needed. "Whether every flashcard/study route relies on an RLS-scoped client only, or if a service-role client is used anywhere" — confirmed: RLS-only, no service-role client exists. "Enumerate all such routes" — done above (6 routes: index.ts GET/POST, manual.ts POST, [id].ts PATCH/DELETE, due.ts GET, review.ts POST). Cheapest layer confirmed as **integration** (two seeded users against local Supabase) — a unit test can't exercise RLS. Anti-pattern to avoid (asserting only the no-auth 401, never the cross-user 403/404) is precisely the untested gap.

### Risk #2 — SR scheduling contract

**Library**: `ts-fsrs@5.4.2`, pinned in [`package.json:35`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/package.json#L35), resolved in lockfile.

**Scheduling code** — [`src/lib/services/scheduler.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/lib/services/scheduler.ts) (47 lines, full file):

```ts
import { fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import type { Flashcard, FlashcardUpdate } from "@/types";

const scheduler = fsrs();
// RATING_MAP: again→Rating.Again, hard→Rating.Hard, good→Rating.Good, easy→Rating.Easy  (lines 8-13)

export function rowToCard(row: Flashcard): Card { /* 1:1 field mapping, lines 15-28 */ }

export function gradeCard(row: Flashcard, rating: ReviewRating, now: Date): FlashcardUpdate {
  const card = rowToCard(row);
  const { card: updated } = scheduler.next(card, now, RATING_MAP[rating]);
  return { due: updated.due.toISOString(), stability: updated.stability, difficulty: updated.difficulty,
    elapsed_days: updated.elapsed_days, scheduled_days: updated.scheduled_days, learning_steps: updated.learning_steps,
    reps: updated.reps, lapses: updated.lapses, state: updated.state,
    last_review: updated.last_review ? updated.last_review.toISOString() : null };
}
```

This is a **pure, zero-I/O function** given a fixed `now` — the ideal first unit-test target, no mocking required.

**Route** — [`src/pages/api/study/review.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/pages/api/study/review.ts) (56 lines): zod validates `{ id: number, rating: "again"|"hard"|"good"|"easy" }` (8-11); selects the row by id with no `user_id` filter (35-39, RLS-scoped, see Risk #1); calls `gradeCard(row, rating, new Date())` (48); persists the returned object verbatim via `.update(update).eq("id", ...)` (50) with no further validation.

**Table schema** — [`supabase/migrations/20260822203058_create_flashcards.sql:13-22`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/supabase/migrations/20260822203058_create_flashcards.sql#L13-L22) (`due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state smallint check (state between 0 and 3), last_review`) plus the follow-up [`20260907215335_add_flashcards_learning_steps.sql`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/supabase/migrations/20260907215335_add_flashcards_learning_steps.sql) (`learning_steps smallint not null default 0`) — the concrete artifact of the contract-mismatch discovery.

**Library's actual contract, verified against compiled source** (`node_modules/ts-fsrs/dist/index.mjs`, not just docs):
- `Rating` enum: `Manual=0, Again=1, Hard=2, Good=3, Easy=4`; `State` enum: `New=0, Learning=1, Review=2, Relearning=3` (`dist/index.d.ts:2-15`).
- `reviewState(grade)` (invoked when `state === Review`), lines ~1099-1115: only the `Again` branch does `this.applyLearningSteps(next_again, Rating.Again, State.Relearning); next_again.lapses += 1;` — `Hard`/`Good`/`Easy` never touch `lapses` and never move to `Relearning`.
- Rollback logic (line ~1711) independently re-derives the same invariant: `lapses` decrements only when `rating === Again && state === Review`.

This is the exact, independently-sourced behavioral invariant the test-plan's Risk #2 response guidance wants proven: *"a failing grade shortens the next interval and increments the lapse count from a review state; an easy grade lengthens it."* — confirmed true against the real installed library, giving `/10x-plan` a non-tautological oracle to assert against (the library's own documented direction, not whatever `scheduler.ts` currently outputs).

**Existing tests**: none. `ai-generate-review-study-loop/plan.md:320` explicitly documents this as a deliberate gap: "no test runner is configured in this repo... AI-response parsing and the FSRS scheduling wrapper are verified manually."

**History of the contract mismatch** — [`ai-generate-review-study-loop/plan.md:23-28`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/ai-generate-review-study-loop/plan.md#L23-L28) (Key Discoveries addendum) and [`:342-344`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/context/changes/ai-generate-review-study-loop/plan.md#L342-L344) (Migration Notes addendum): the original `flashcards-data-foundation` plan claimed the DB schema matched `ts-fsrs`'s `Card` shape "1:1, no adapter needed" — that claim was wrong (missing `learning_steps`), discovered only during Phase 3 implementation of the *next* slice, requiring a follow-up migration.

### Correction to test-plan.md's framing (flag for backport)

Test-plan.md §2 row 2's Source column states: *"installed SR library's card contract already changed once, undetected until implementation."* This slightly overstates *when* the change happened. Per `node_modules/ts-fsrs/CHANGELOG.md:126-127`, `learning_steps` was added in **ts-fsrs v5.0.0 (2025-05-12)** — months before this project ever pinned `^5.4.2`. The library did not change underfoot during this project; rather, `flashcards-data-foundation/plan.md:24` asserted the "matches 1:1" claim **before `ts-fsrs` was even installed as a dependency** (that same plan, line 30, explicitly deferred installing it to the next slice), so the claim was never checked against the library's real type definitions until Phase 3 implementation of `ai-generate-review-study-loop`.

The underlying risk is still accurate and equally severe (an unverified assumption about a third-party contract, caught only mid-implementation, with no regression guard today) — only the causal narrative ("library changed") vs. ("assumption was never verified against an already-current library") needs a wording fix. This does **not** change the response guidance, the cheapest layer (unit), or the anti-pattern to avoid — no functional correction needed, just a Source-column wording nit. Recommend a one-line backport at the next `/10x-test-plan` invocation; not blocking for `/10x-plan`.

### Stack — Vitest bootstrap facts

- **Nothing exists yet**: no `vitest`/`jest`/`playwright` in `package.json` scripts or deps ([`package.json:5-13`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/package.json#L5-L13) has no `test` script at all), no config files anywhere, zero existing test files.
- `package.json:2` → `"type": "module"` — author Vitest config as ESM (`vitest.config.ts`, `export default defineConfig(...)`).
- [`tsconfig.json`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/tsconfig.json) confirms `@/*` → `./src/*` (lines 8-11); no `types` array yet (would need `vitest/globals` or similar added once Vitest lands, if desired).
- [`astro.config.mjs:19-21`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/astro.config.mjs#L19-L21): `SUPABASE_URL`/`SUPABASE_KEY`/`OPENROUTER_API_KEY` are all `context: "server", access: "secret", optional: true`, resolved via the virtual module `astro:env/server` — **plain Vitest will not resolve this module**; any test importing `src/lib/supabase.ts` or `src/lib/services/openrouter.ts` needs it mocked (`vi.mock("astro:env/server", ...)`) or aliased. `src/lib/services/scheduler.ts` (Risk #2's target) has **no such dependency** — it neither imports env nor does I/O, so it's testable with zero setup.
- [`src/lib/supabase.ts`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/src/lib/supabase.ts): `createClient(requestHeaders: Headers, cookies: AstroCookies)` — an integration test needs a real `SUPABASE_URL`/anon key pointed at local Supabase (mocked through `astro:env/server`), a minimal `Headers` with a `Cookie` string, and a stub object satisfying `cookies.set(name, value, options)`.
- **Local Supabase is ready**: [`supabase/config.toml`](https://github.com/marcinfuras-copilot/10xcards/blob/c3ceaadff6ef192080f86ca145d7e5280339862f/supabase/config.toml) (API port 54321, DB port 54322, Postgres 17); exactly 2 migrations exist (`20260822203058_create_flashcards.sql`, `20260907215335_add_flashcards_learning_steps.sql`) — everything the integration test for Risk #1 needs to seed two users and their rows.
- `src/lib/services/` has exactly 2 files: `scheduler.ts` (pure, Risk #2's target) and `openrouter.ts` (I/O-bound, out of scope for this phase — that's Risk #5, Phase 4).

## Code References

- `src/lib/supabase.ts:6-24` — the one Supabase client factory used by every route
- `src/middleware.ts:1-24` — full middleware; no row-level authz, no locals-attached client
- `supabase/migrations/20260822203058_create_flashcards.sql:1-64` — table def + RLS policies
- `supabase/migrations/20260907215335_add_flashcards_learning_steps.sql:1-2` — the `learning_steps` follow-up migration
- `src/pages/api/flashcards/index.ts:14-83` — list/create, no `user_id` filter on select
- `src/pages/api/flashcards/[id].ts:22-92` — update/delete, id from params, no `user_id` filter
- `src/pages/api/flashcards/manual.ts:16-53` — manual create, `user_id` set server-side
- `src/pages/api/study/due.ts:9-31` — due-cards list, no `user_id` filter
- `src/pages/api/study/review.ts:13-56` — grade endpoint, id from body, no `user_id` filter, calls `gradeCard`
- `src/lib/services/scheduler.ts:1-47` — full scheduler wrapper (`rowToCard`, `gradeCard`)
- `package.json:2,5-13,35` — module type, scripts (no `test`), `ts-fsrs` pin
- `astro.config.mjs:19-21` — `astro:env/server` schema, all secrets optional
- `tsconfig.json:1-13` — path alias, strict base

## Architecture Insights

- **Single-point-of-failure authorization design**: every flashcard/study route delegates 100% of cross-user isolation to Postgres RLS with zero app-layer defense-in-depth. This is a deliberate, documented convention (`CLAUDE.md` mandates RLS as *the* enforcement point, not app-layer checks — consistent with `flashcards-data-foundation/plan.md:23`), so an integration test asserting RLS behavior end-to-end is testing the actual security boundary, not a redundant check.
- **Scheduling is a thin pure-mapping layer over a well-tested third-party algorithm**: `scheduler.ts` does no math itself; all risk lives in the field-mapping fidelity between the DB row shape and `ts-fsrs`'s `Card` type, which has already drifted once undetected.
- **`astro:env/server` virtual-module boundary** is the one recurring friction point for any test that imports code touching Supabase or OpenRouter — plan the Vitest setup to mock it once, reusably, rather than per-test.

## Historical Context (from prior changes)

- `context/changes/flashcards-data-foundation/plan.md` — RLS foundation, the one place a real cross-user probe was run manually (`eeb3a0c`); also the origin of the (incorrect-at-the-time) "matches ts-fsrs 1:1" claim.
- `context/changes/ai-generate-review-study-loop/plan.md` + `reviews/impl-review.md` — where the `learning_steps` gap surfaced and was fixed; documents the deliberate "no test runner, verified manually" decision this rollout phase is meant to close.
- `context/changes/flashcard-management-list/reviews/impl-review.md`, `context/changes/manual-flashcard-creation/reviews/impl-review.md` — later manual re-assertions of "RLS-scoped, not service-role" as a design property, never a live re-run of the cross-user attack.
- Note: `context/archive/` currently contains no archived change folders (only `README.md`) — all four referenced slices are still under `context/changes/`.

## Related Research

None yet — this is the first `research.md` in this repo.

## Open Questions

- None blocking. `/10x-plan` can proceed directly for both risks; the one open item is the cosmetic Source-column wording correction on test-plan.md §2 row 2, which is a candidate for backport at the next `/10x-test-plan` invocation, not a blocker here.
