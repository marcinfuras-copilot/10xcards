# Critical-Path Test Coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Bootstrap Vitest as this project's first test runner and close the two highest-priority risks from `test-plan.md` §3 Phase 1: an authenticated user reading/editing/deleting/grading another user's flashcard (IDOR, Risk #1), and grading producing scheduling fields that don't match `ts-fsrs`'s actual rating/lapse contract (Risk #2). Both are currently verified only by one-time manual checks with no automated regression guard.

## Starting Point

No test infrastructure exists anywhere in the repo — no config, no test deps, zero test files. Research confirmed both risks are real: all 5 read/list/mutate/grade flashcard routes rely purely on RLS with no app-layer ownership filter, and the SR scheduler's field-mapping already drifted from `ts-fsrs`'s contract once (the `learning_steps` gap), caught only mid-implementation of a later slice.

## Desired End State

`npm run test:unit` runs instantly, no Docker needed, and proves the scheduler's rating/lapse direction against the library's own verified behavior. `npm run test:integration` (needs `supabase start`) proves a second user genuinely cannot read, list, update, delete, or grade the first user's flashcard, across every route where that gap could reappear. `test-plan.md` §6 documents the real pattern for the next test.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Integration test environment | Real local Supabase, not mocked | Only real Postgres+RLS can prove the authorization boundary; a mock can't catch this regression class | Plan (user-confirmed) |
| Test-user seeding | Service-role Admin API, test-only | Fast, deterministic, isolated from app code (which has zero service-role usage today) | Plan (user-confirmed) |
| npm scripts | Split `test:unit` / `test:integration` (+ `test` runs both) | Keeps unit tests Docker-free; matches Phase 5's later CI-gating needs | Plan (user-confirmed) |
| IDOR coverage breadth | One assertion per route (6 total) | Matches the risk's "any route" scope from research's route-by-route mapping | Plan (user-confirmed) |
| Test file location | Centralized `src/__tests__/` mirroring `src/` | Keeps `src/` app-code-only | Plan (user-confirmed) |
| Scheduler test breadth | All 4 ratings from Review + New→Learning path | Matches the risk's literal "each of the four ratings" wording | Plan (user-confirmed) |
| How to invoke routes under test | Direct per-user Supabase clients running each route's exact query, not the Astro route handlers themselves | Avoids faking `@supabase/ssr`'s internal cookie format (brittle); this risk targets the RLS boundary, not route plumbing | Plan |

## Scope

**In scope:**
- Vitest bootstrap (config, scripts, `astro:env/server` mock pattern)
- Unit test: SR scheduler rating/lapse/interval contract
- Integration test: cross-user isolation across 6 checkpoints (5 routes + 1 control)
- `test-plan.md` §6.1/§6.2/§6.6 cookbook update

**Out of scope:**
- CI wiring (test-plan.md §3 Phase 5)
- `@cloudflare/vitest-plugin`/workerd bindings (not needed by either test)
- The AI-generation boundary risk (#5 — Phase 4) and `flashcards/generate.ts`
- Routes' 401/unauthenticated behavior (already covered by each route's own check; not this risk's gap)
- e2e/Playwright (Phase 5)

## Architecture / Approach

Two independent Vitest configs — `vitest.config.ts` (unit, no external deps) and `vitest.integration.config.ts` (Supabase-backed, longer timeout). The integration suite uses plain `@supabase/supabase-js` clients signed in as two throwaway users (seeded/cleaned up via a service-role admin client, test-only) to run the exact query pattern each route executes, asserting RLS's cross-user behavior directly — cheaper and less brittle than invoking the actual Astro route handlers.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest bootstrap + SR scheduler unit tests | Working `test:unit`, scheduler contract proven | Vitest/`astro:env/server` interop friction |
| 2. Integration harness + cross-user IDOR tests | Working `test:integration`, 6 IDOR checkpoints proven | Service-role key handling; test-user cleanup reliability |
| 3. Cookbook + docs update | `test-plan.md` §6 filled in | None — documentation only |

**Prerequisites:** None — the 4 product slices this tests are already implemented; this change adds no product features.
**Estimated effort:** ~2-3 sessions across 3 phases (solo, after-hours pace consistent with this project's roadmap).

## Open Risks & Assumptions

- Assumes `supabase start` (Docker) is available in the local dev environment for Phase 2 and its manual verification — already a documented project requirement (CLAUDE.md).
- The direct-client RLS-testing approach (vs. invoking route handlers) means route-level bugs unrelated to RLS (e.g., a future route forgetting its own auth check) would not be caught by this suite — acceptable since that's not what Risk #1 targets.
- A minor test-plan.md §2 wording nit was flagged in research (SR library "already changed" vs. "assumption never verified against an already-current library") — cosmetic, not blocking, flagged for the next `/10x-test-plan` backport pass.

## Success Criteria (Summary)

- A second user cannot read, list, update, delete, or grade a flashcard they don't own, proven against real RLS, not a mock.
- Grading with any of the four ratings moves scheduling fields in the direction `ts-fsrs` itself guarantees, not just whatever the code currently outputs.
- Both suites run locally today (`test:unit` always; `test:integration` with `supabase start`), and `test-plan.md` §6 tells the next contributor exactly how to add to either.
