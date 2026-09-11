# Critical-Path Test Coverage Implementation Plan

## Overview

Bootstrap Vitest as this project's first test runner and close the two highest-priority risks from `context/foundation/test-plan.md` §3 Phase 1: the SR scheduler's rating/lapse contract (Risk #2, unit layer) and cross-user flashcard access (Risk #1, integration layer against real local Supabase + RLS).

## Current State Analysis

No test infrastructure exists anywhere in this repo: no `vitest`/`jest`/`playwright` config, no test-related dependencies, zero `*.test.ts` files, no `test` script in `package.json` (`package.json:5-13`). Both risks are currently verified only by manual spot-checks — Risk #1's only live cross-user probe was a one-time manual check at the RLS-foundation stage (`context/changes/flashcards-data-foundation/plan.md:236`); Risk #2's scheduling wrapper has never been tested (`context/changes/ai-generate-review-study-loop/plan.md:320`).

## Desired End State

`npm run test:unit` runs instantly with no external dependencies and proves the SR scheduler's rating→lapse/interval contract. `npm run test:integration` (requires `supabase start` first) proves that a second authenticated user cannot read, list, update, delete, or grade another user's flashcard, across every route where that gap could reappear. `npm test` runs both. `context/foundation/test-plan.md` §6.1/§6.2 name the real location, naming, and run command for the next person adding a test.

**Verification**: run `npm run test:unit` and (with `supabase start` running) `npm run test:integration` — both exit 0. `npm run lint` and `npx astro check` still pass.

### Key Discoveries:

- `src/lib/services/scheduler.ts:1-47` is pure and zero-I/O — `gradeCard(row, rating, now)` needs no mocking (`research.md` §"Risk #2").
- All 5 read/list/mutate/grade routes (`flashcards/index.ts` GET, `flashcards/[id].ts` PATCH/DELETE, `study/due.ts` GET, `study/review.ts` POST) rely **exclusively** on RLS with no app-layer `user_id` filter — the id comes straight from the request (`research.md` §"Risk #1" route table). `flashcards/index.ts` POST and `flashcards/manual.ts` POST set `user_id` from the session server-side and are "correct by construction" — included as a control assertion, not a vulnerability.
- `astro:env/server` is a virtual module Vitest cannot resolve natively — any test importing `src/lib/supabase.ts` needs it aliased/mocked (`research.md` §"Stack").
- No route or app code anywhere constructs a service-role client (`research.md` §"Risk #1" — confirmed by repo-wide grep). This plan introduces the project's **first** service-role usage, strictly inside test setup, never in `src/`.
- Local Supabase is already configured (`supabase/config.toml`, API port 54321) with 2 migrations (`flashcards-data-foundation`, `learning_steps` follow-up) — ready to seed against.
- `ts-fsrs@5.4.2`'s compiled logic (verified in `research.md`, `node_modules/ts-fsrs/dist/index.mjs`) confirms: only a rating of `Again` from `state=Review` increments `lapses` and transitions to `Relearning`; `Hard`/`Good`/`Easy` never touch `lapses`.
- `vitest@5.0.0`'s peer range (`vite ^6.4.0 || ^7.0.0 || ^8.0.0`) is compatible with this repo's pinned `vite ^7.3.2` override; requires `@types/node ^22.0.0`, matching `.nvmrc` (22.14.0) — confirmed via `npm view` during planning.

## What We're NOT Doing

- Not wiring these tests into CI yet — that's test-plan.md §3 Phase 5 ("Quality-gates wiring"). This phase only makes the commands exist and pass locally.
- Not adding `@cloudflare/vitest-plugin`/workerd bindings — neither test needs real Workers runtime; deferred per `test-plan.md` §4 until a test actually needs it.
- Not testing the `flashcards/generate.ts` route (no DB access, not part of either risk) or the AI-provider failure-mode risk (#5 — that's test-plan.md §3 Phase 4).
- Not testing routes' 401 (unauthenticated) behavior — already implicitly covered by every route's own check and not what Risk #1's "must challenge" column targets (the gap is specifically the cross-user 403/404 case).
- Not adding e2e/Playwright — that's test-plan.md §3 Phase 5.
- Not testing `ts-fsrs`'s own internal correctness — trusting the library is a PRD non-goal (test-plan.md §7); this plan tests our mapping *to* its contract, not the library itself.

## Implementation Approach

Two independent Vitest configs (`vitest.config.ts` for unit, `vitest.integration.config.ts` for integration) so `test:unit` never requires Docker. Both configs share the `@/*` alias and an `astro:env/server` mock via `vite-tsconfig-paths`-free manual `resolve.alias`, since no Astro plugin is loaded outside the Astro build pipeline. Integration tests use `@supabase/supabase-js`'s plain client (not the `@supabase/ssr` cookie-based one used by routes) — one signed-in client per test user — to execute the exact query pattern each route runs (select-by-id, update-by-id, delete-by-id, `lte("due", ...)`, insert) and assert RLS's cross-user behavior directly. This is the cheapest layer that still exercises the real RLS boundary; it intentionally does not invoke the Astro route handlers themselves (which would require faking `@supabase/ssr`'s internal cookie-chunking format — brittle, and this risk targets the RLS boundary, not route-handler plumbing).

## Critical Implementation Details

**Test-user credentials and cleanup ordering.** Integration tests must create their two test users and seed flashcard rows in `beforeAll`, and must delete the flashcard rows before deleting the users in `afterAll` (a user delete cascades to their flashcards per `on delete cascade`, so explicit row cleanup is technically redundant, but deleting rows first makes failures easier to diagnose and keeps the local DB clean if user deletion fails mid-run).

**Service-role key handling.** The service-role key must never be read via `astro:env/server` (that schema only declares the three existing secrets) or committed anywhere — read it directly from `process.env.SUPABASE_SERVICE_ROLE_KEY` in the integration test setup file only, sourced from `supabase status -o env` locally. Document this as a one-time local setup step; do not add it to `.env.example` (that file is for the app's own runtime secrets, not test-only ones).

## Phase 1: Vitest Bootstrap + SR Scheduler Unit Tests

### Overview

Install Vitest, wire the three npm scripts, add the `astro:env/server` alias, and prove Risk #2's rating/lapse contract with a pure unit test — no external dependencies, so this phase alone gives the project a working, fast test command.

### Changes Required:

#### 1. Dependencies

**File**: `package.json`

**Intent**: Add Vitest and its Node typings as dev dependencies; add `test`, `test:unit`, `test:integration` scripts.

**Contract**: `devDependencies` gains `"vitest": "^5.0.0"` and `"@types/node": "^22.14.0"`. `scripts` gains `"test": "npm run test:unit && npm run test:integration"`, `"test:unit": "vitest run --config vitest.config.ts"`, `"test:integration": "vitest run --config vitest.integration.config.ts"`.

#### 2. Unit test config

**File**: `vitest.config.ts` (new)

**Intent**: Configure Vitest for fast, dependency-free unit tests only.

**Contract**: `defineConfig({ test: { include: ["src/__tests__/**/*.test.ts"], exclude: ["src/__tests__/api/**"] }, resolve: { alias: { "@": path.resolve(__dirname, "./src") } } })`. The `src/__tests__/api/**` exclusion is what keeps `test:unit` Docker-free — integration specs live there and are picked up only by the integration config.

#### 3. Integration test config

**File**: `vitest.integration.config.ts` (new)

**Intent**: Configure Vitest for the Supabase-backed integration suite, with a longer timeout (network round-trips to local Supabase) and the same path alias.

**Contract**: `defineConfig({ test: { include: ["src/__tests__/api/**/*.test.ts"], testTimeout: 15000 }, resolve: { alias: { "@": path.resolve(__dirname, "./src") } } })`.

#### 4. `astro:env/server` mock

**File**: `src/__tests__/setup/astro-env-mock.ts` (new)

**Intent**: Let any test that transitively imports `src/lib/supabase.ts` or `src/lib/services/openrouter.ts` resolve the `astro:env/server` virtual module, which plain Vitest cannot load. Not needed by the scheduler test itself (it has no such import), but establishes the pattern Phase 2's integration tests and future phases (e.g., Phase 4's AI-boundary tests) will reuse.

**Contract**: A Vitest `setupFiles`-registered module using `vi.mock("astro:env/server", () => ({ SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_KEY: process.env.SUPABASE_KEY, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY }))`. Register it via `test.setupFiles` in whichever config(s) need it (not the unit config, since the scheduler test doesn't need it — add it to `vitest.integration.config.ts` now; Phase 4 adds it to a future unit-mocking scenario if needed there).

#### 5. Scheduler unit test

**File**: `src/__tests__/lib/services/scheduler.test.ts` (new)

**Intent**: Prove `gradeCard`'s output direction matches `ts-fsrs`'s own documented contract (verified against compiled source in `research.md`), not just whatever the function currently returns — the oracle is the library's invariant, not the implementation.

**Contract**: Build one fixture `Flashcard` row with `state = 2` (Review), non-zero `stability`/`difficulty`/`elapsed_days`/`scheduled_days`/`reps`, `lapses = 0`, and a `due` in the past, plus a fixed `now: Date`. For each of the four ratings:
- `again`: assert `state === 3` (Relearning) and `lapses === row.lapses + 1`.
- `hard` / `good` / `easy`: assert `lapses === row.lapses` (unchanged) and `state !== 3`.
- Across `hard` → `good` → `easy`, assert `new Date(update.due).getTime()` is non-decreasing (each rating schedules at least as far out as the previous), proving the "easier rating lengthens the interval" direction without hard-coding exact library-internal values.

Add one more fixture with `state = 0` (New), `reps = 0`, and grade with `good`: assert the resulting `state` is `1` (Learning) or `2` (Review) — i.e., it advances out of `New` — proving the first-review path also produces a sane transition.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` passes
- `npx astro check` (typecheck) passes
- `npm run lint` passes

#### Manual Verification:

- Temporarily invert the `RATING_MAP` for `again`/`easy` in `scheduler.ts`, confirm `test:unit` fails, then revert — proves the test isn't vacuously green (oracle problem check)
- Confirm `npm run test:integration` is *not* invoked by `npm run test:unit` (no Docker dependency for the unit path)

---

## Phase 2: Integration Test Harness + Cross-User IDOR Tests

### Overview

Add a reusable test-setup helper that seeds two throwaway users via the Supabase Admin API, then prove cross-user isolation across the 5 vulnerable routes plus the create-ownership control — all by exercising the same query patterns each route runs, through per-user signed-in clients.

### Changes Required:

#### 1. Test-user seeding helper

**File**: `src/__tests__/setup/seed-users.ts` (new)

**Intent**: Create two auth users and one seeded flashcard row per user via the service-role client, expose signed-in `SupabaseClient` instances scoped to each user for the tests to use, and tear everything down afterward.

**Contract**: Exports `async function seedTwoUsers(): Promise<{ userA: SeededUser; userB: SeededUser; cleanup: () => Promise<void> }>`, where `SeededUser` holds `{ id, client, flashcardId }`. Internally: an admin client built with `createClient(url, serviceRoleKey)` (from `@supabase/supabase-js`, not `@supabase/ssr`) creates each user via `admin.createUser({ email, password, email_confirm: true })`, then a plain anon-key client per user calls `signInWithPassword` to obtain the real signed-in client, then the admin client inserts one flashcard row per user directly (bypassing RLS, so ownership can be set explicitly). `cleanup()` deletes both flashcard rows, then both users, via the admin client.

#### 2. Cross-user IDOR integration test

**File**: `src/__tests__/api/flashcards-authorization.test.ts` (new)

**Intent**: Directly test the RLS boundary every route depends on, using the exact query shape each route runs, for all 6 identified checkpoints.

**Contract**: One `describe` block, `beforeAll` calling `seedTwoUsers()`, `afterAll` calling `cleanup()`. Six test cases, each using `userB.client` attempting the operation against `userA.flashcardId`:
1. List (`flashcards/index.ts` GET pattern: `.from("flashcards").select("*")`) — assert the returned set does not contain `userA.flashcardId`.
2. Due-list (`study/due.ts` GET pattern: `.select("*").lte("due", ...)`) — same assertion.
3. Update (`flashcards/[id].ts` PATCH pattern: `.update({...}).eq("id", userA.flashcardId)`) — assert the response has no data / an empty array, and a follow-up select by `userA.client` shows the row unchanged.
4. Delete (`flashcards/[id].ts` DELETE pattern: `.delete().eq("id", userA.flashcardId)`) — assert empty result, and `userA.client` can still select the row afterward.
5. Grade (`study/review.ts` POST pattern: select-by-id then `.update(gradeCard(...))`) — assert the initial select-by-id returns no row for `userB.client`, so the route's existing "no row → 404" branch is what would fire; no update is attempted.
6. Create-ownership control: `userB.client.from("flashcards").insert({ question, answer, user_id: userA.id })` — assert this is **rejected** by the `flashcards_insert_own` policy's `with check`, proving a client can't spoof `user_id` even if it tried (positive-path control for the "set from session, not from body" pattern already used in `index.ts`/`manual.ts`).

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` passes (with `supabase start` already running)
- `npx astro check` passes
- `npm run lint` passes

#### Manual Verification:

- Run `supabase start`, then `npm run test:integration`, confirm all 6 checkpoints pass
- Temporarily drop the `flashcards_update_own` RLS policy (`drop policy flashcards_update_own on public.flashcards;` in the local DB), confirm the update checkpoint test fails, then re-apply (`supabase db reset` or re-run migrations) — proves the test would actually catch a real regression
- Confirm test users and seeded rows are gone from Studio (`http://localhost:54323`) after the suite finishes (cleanup ran)

---

## Phase 3: Cookbook + Docs Update

### Overview

Fill in `context/foundation/test-plan.md` §6.1 and §6.2 with the real location, naming, and run-command conventions this phase established, replacing the `TBD` placeholders.

### Changes Required:

#### 1. Cookbook entries

**File**: `context/foundation/test-plan.md`

**Intent**: Give the next person (or `/10x-tdd`) a concrete answer for "how do I add a unit test" and "how do I add an integration test" in this project.

**Contract**: §6.1 ("Adding a unit test") documents: location `src/__tests__/<mirrors src path>/<name>.test.ts`, config `vitest.config.ts`, run command `npm run test:unit`, reference test `src/__tests__/lib/services/scheduler.test.ts`, and the oracle-problem note (assert against an independently-sourced contract, not current output). §6.2 ("Adding an integration test") documents: location `src/__tests__/api/<name>.test.ts`, config `vitest.integration.config.ts`, run command `npm run test:integration` (requires `supabase start` first), the `seedTwoUsers()` helper's location and contract, and the `SUPABASE_SERVICE_ROLE_KEY` local-only env var requirement. §6.6 gets a 2-3 line note: this phase chose direct-client RLS testing over invoking route handlers, and why (avoids faking `@supabase/ssr`'s cookie format).

### Success Criteria:

#### Automated Verification:

- `npx astro check` passes (no code change, but confirms nothing broke)

#### Manual Verification:

- §6.1/§6.2/§6.6 no longer read "TBD" and correctly describe the patterns from Phases 1-2
- A fresh read of test-plan.md §6 by someone unfamiliar with this phase would tell them exactly where to put a new unit or integration test

---

## Testing Strategy

### Unit Tests:

- Scheduler rating/lapse/interval direction contract (all 4 ratings from Review state, plus New→Learning first-review)

### Integration Tests:

- Cross-user isolation across list, due-list, update, delete, grade, and a create-ownership control (6 checkpoints total)

### Manual Testing Steps:

1. `npm run test:unit` — should pass instantly with no Docker running
2. `supabase start`, then `npm run test:integration` — should pass
3. Break the scheduler rating map, confirm the unit test catches it, revert
4. Drop the update RLS policy locally, confirm the integration test catches it, restore via `supabase db reset`

## Performance Considerations

Integration tests hit real network round-trips to local Supabase (auth + Postgres) — the 15s `testTimeout` in `vitest.integration.config.ts` accounts for this; no other performance concerns at this scale (2 users, 1-2 rows).

## Migration Notes

No schema changes in this plan. Test setup relies on the two existing migrations already in `supabase/migrations/`.

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Risk source: `context/foundation/test-plan.md` §2 (Risk Response Guidance, rows #1 and #2), §3 Phase 1
- Scheduler under test: `src/lib/services/scheduler.ts:1-47`
- Routes under test: `src/pages/api/flashcards/index.ts`, `src/pages/api/flashcards/[id].ts`, `src/pages/api/study/due.ts`, `src/pages/api/study/review.ts`
- RLS policies: `supabase/migrations/20260822203058_create_flashcards.sql:45-64`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Vitest Bootstrap + SR Scheduler Unit Tests

#### Automated

- [x] 1.1 `npm run test:unit` passes — ee163cb
- [x] 1.2 `npx astro check` (typecheck) passes — ee163cb
- [x] 1.3 `npm run lint` passes — ee163cb

#### Manual

- [x] 1.4 Inverted-rating-map mutation test confirms the unit test catches a regression, then reverted — ee163cb
- [x] 1.5 Confirmed `test:unit` does not require Docker/local Supabase — ee163cb

### Phase 2: Integration Test Harness + Cross-User IDOR Tests

#### Automated

- [ ] 2.1 `npm run test:integration` passes (with `supabase start` running) — BLOCKED: this session has no Docker access (see change.md notes); needs user verification
- [x] 2.2 `npx astro check` passes
- [x] 2.3 `npm run lint` passes

#### Manual

- [ ] 2.4 All 6 IDOR checkpoints pass against local Supabase
- [ ] 2.5 Dropped-RLS-policy mutation test confirms the integration test catches a regression, then restored
- [ ] 2.6 Confirmed test users/rows are cleaned up after the suite runs

### Phase 3: Cookbook + Docs Update

#### Automated

- [ ] 3.1 `npx astro check` passes

#### Manual

- [ ] 3.2 §6.1/§6.2/§6.6 updated and no longer read "TBD"
- [ ] 3.3 Cookbook entries verified legible to someone unfamiliar with this phase
