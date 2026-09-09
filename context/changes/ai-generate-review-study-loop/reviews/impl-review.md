<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Generate → Review → Save → Study Loop Implementation Plan

- **Plan**: context/changes/ai-generate-review-study-loop/plan.md
- **Scope**: Phase 1, 2, 3 of 3 (full plan)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Undocumented `learning_steps` migration and Phase 3 contract deviation

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `supabase/migrations/20260907215335_add_flashcards_learning_steps.sql`; `src/lib/services/scheduler.ts:22,41`
- **Detail**: The plan's Migration Notes state "Not applicable — no schema changes in this plan," and Phase 3's contract for `rowToCard`/`gradeCard` lists an exact field set (`due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review`) that excludes `learning_steps`. The plan's Key Discoveries also claims the `ts-fsrs` `Card` interface matches the `flashcards` table 1:1. In reality, the installed `ts-fsrs@5.4.2`'s `Card` type has a required, non-optional `learning_steps: number` field that F-01's original schema didn't have. The implementer correctly discovered this during Phase 3, added an additive migration (`add column learning_steps smallint not null default 0`), regenerated `src/db/database.types.ts`, and wired the field through `scheduler.ts` — but never updated the plan document to reflect it. Functionally this is necessary and correct (the code wouldn't type-check or run without it); the issue is purely that the plan's own claims are now false and the deviation is undocumented.
- **Fix A ⭐ Recommended**: Amend `plan.md` with an addendum: correct the Key Discoveries claim, add the migration to Migration Notes, and update the Phase 3 field list to include `learning_steps`.
  - Strength: Keeps the plan a truthful record for future reviews/archival; matches this project's existing addendum convention for discovered scope.
  - Tradeoff: None significant — documentation-only, a few minutes of work.
  - Confidence: HIGH — this is exactly the kind of discovered-scope correction this repo's process already expects.
  - Blind spot: None significant.
- **Fix B**: Leave `plan.md` as-is and record the general pattern via `/10x-lesson` ("verify a third-party library's actual installed-version type contract before locking an exact field list in a plan").
  - Strength: Captures the generalizable lesson so future plans don't repeat the same "exact field list without verifying the installed library version" mistake.
  - Tradeoff: `plan.md` itself stays factually wrong for anyone reading it standalone later (e.g. during archival).
  - Confidence: MEDIUM — useful but doesn't fix the immediate inaccuracy.
  - Blind spot: Haven't checked whether other plans in this repo follow the same exact-field-list pattern that could recur.
- **Decision**: FIXED (Fix A) — plan.md amended: Key Discoveries corrected, Migration Notes updated, Phase 3 field list now includes `learning_steps`.

### F2 — `zod` not used in any new API route despite CLAUDE.md convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/flashcards/generate.ts:21-34`; `src/pages/api/flashcards/index.ts:29-58`; `src/pages/api/study/due.ts`; `src/pages/api/study/review.ts:10-28`
- **Detail**: CLAUDE.md states explicitly: "API routes: use uppercase GET, POST exports; validate input with zod." All four new JSON API routes use hand-rolled type guards (`isValidCard`, `isValidRating`, manual length checks) instead. `zod` isn't even a dependency in `package.json`. The manual validation is functionally correct and adequate, but it establishes a second, competing validation convention right as this codebase's first generation of JSON API routes lands — future routes now have two patterns to choose from.
- **Fix A ⭐ Recommended**: Add `zod` and replace the hand-rolled validators in all four routes with zod schemas.
  - Strength: Brings the first generation of JSON API routes in line with the project's own written convention before more routes copy the manual pattern.
  - Tradeoff: Touches 4 files; adds a new runtime dependency; needs care that zod's default coercion/parsing semantics don't subtly change behavior (e.g. trimming, empty-string handling).
  - Confidence: HIGH — CLAUDE.md is unambiguous and there's no prior JSON-route precedent to conflict with.
  - Blind spot: Haven't checked whether zod was deliberately deferred over Cloudflare Workers edge bundle-size concerns.
- **Fix B**: Update CLAUDE.md to describe hand-rolled validation as acceptable for simple, flat request shapes, reserving zod for more complex payloads.
  - Strength: No code churn; the validation here really is simple (a handful of primitive fields).
  - Tradeoff: Weakens a previously clear, unconditional convention — future agents lose a bright line for which pattern to use.
  - Confidence: MEDIUM — reasonable, but a documentation retreat rather than a fix.
  - Blind spot: Unclear whether upcoming routes in this feature family will need zod's richer validation (nested shapes, refinements) where hand-rolling gets unwieldy.
- **Decision**: FIXED (Fix A) — added `zod` dependency; replaced hand-rolled validators with zod schemas in `generate.ts`, `flashcards/index.ts` (POST), and `study/review.ts`. `study/due.ts` had no request body/params to validate, so it was left unchanged. Verified with `npx astro check`, `npm run lint`, `npm run build` (all pass).

### F3 — Unbounded save-batch size on `POST /api/flashcards`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/flashcards/index.ts:56-58`
- **Detail**: `isValidCard` validates each card's shape and per-field length, but `body.cards` itself has no upper-bound check. The normal UI flow indirectly caps candidates at 20 via `MAX_CANDIDATES` in `openrouter.ts`, but a client calling this JSON endpoint directly (bypassing the review UI) can submit an arbitrarily large `cards` array in a single insert.
- **Fix**: Cap `body.cards.length` (e.g. to the same 20 as `MAX_CANDIDATES`) alongside the existing per-card validation in `isValidCard`'s caller.
- **Decision**: FIXED — added `MAX_CARDS_PER_SAVE = 20` constant and `.max(MAX_CARDS_PER_SAVE)` to the zod schema's `cards` array in `src/pages/api/flashcards/index.ts`.

### F4 — No rate limiting on the OpenRouter-backed generate endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/flashcards/generate.ts:16-45`
- **Detail**: Any authenticated user can call this endpoint repeatedly with up to 10,000 chars per request, with no throttling — a cost exposure against the OpenRouter budget distinct from the Cloudflare Workers CPU-cap risk the plan already discusses under Performance Considerations. The plan's existing risk-acceptance language covers CPU/paid-plan, not call-frequency/spend.
- **Fix A ⭐ Recommended**: Accept as a known MVP risk, consistent with the plan's existing pattern of deferring infra-level mitigations, and extend the Performance Considerations note to explicitly cover call-frequency/cost exposure (not just CPU).
  - Strength: Consistent with this plan's own stated approach to infra risk for a solo-dev, 3-week MVP; doesn't block shipping the north-star slice.
  - Tradeoff: Leaves a real cost-exposure surface open until real traffic arrives.
  - Confidence: MEDIUM — reasonable for current project stage, but there's no usage data yet to size the actual risk.
  - Blind spot: Haven't checked whether OpenRouter's own account-level budget caps already provide a backstop.
- **Fix B**: Add basic per-user rate limiting on the generate route now (e.g. a simple counter).
  - Strength: Closes the exposure before real traffic hits the route.
  - Tradeoff: New infra/complexity that the plan's "What We're NOT Doing" section explicitly rules out ("Not adding new infrastructure... to work around the Cloudflare Workers CPU cap") — arguably contradicts a confirmed plan decision.
  - Confidence: LOW — the plan deliberately chose not to add new infra for this slice; doing so now may be premature.
  - Blind spot: No usage data to justify urgency.
- **Decision**: ACCEPTED (Fix A) — documented as an accepted MVP risk in plan.md's Performance Considerations, alongside the existing CPU-cap risk-acceptance language.

### F5 — OpenRouter response not defensively capped after parsing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/openrouter.ts:141-143`
- **Detail**: `parsed.flashcards.map(truncateCandidate).filter(...)` relies solely on the upstream `strict: true` JSON-schema `maxItems: 20` enforcement rather than defensively slicing locally. If a provider ever ignores or mishandles `maxItems` under strict mode, an oversized batch would pass through uncapped.
- **Fix**: Add `.slice(0, MAX_CANDIDATES)` on `parsed.flashcards` before mapping.
- **Decision**: FIXED — added `.slice(0, MAX_CANDIDATES)` before `.map(truncateCandidate)` in `src/lib/services/openrouter.ts`.

### F6 — `StudySession.tsx` `handleGrade` lacks the unmount-cancellation guard used elsewhere in the same file

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/study/StudySession.tsx:70-98`
- **Detail**: `loadDueCards` (lines 33-68) uses a `cancelled` flag to avoid state updates after unmount, but `handleGrade` doesn't follow the same pattern. Harmless in React 19 (a state update on an unmounted component is a silent no-op), but inconsistent within the same file.
- **Fix**: Add the same `cancelled`-style guard to `handleGrade`, or leave as-is with a short comment noting it's intentionally omitted since grading normally completes before navigation away.
- **Decision**: FIXED — added a `mountedRef`/`isMounted()` guard (function accessor, to avoid TS narrowing `mountedRef.current` as a stale literal across `await`) and checked it before each post-await `setState` in `handleGrade`.

## Success Criteria Verification

**Automated** (run for the full plan):
- `npx astro check` — PASS (0 errors, 0 warnings, 5 hints; one pre-existing deprecation hint for `elapsed_days` in `scheduler.ts:39`, already suppressed with an inline eslint-disable + explanatory comment)
- `npm run lint` — PASS (clean)
- `npm run build` — PASS (production build completed successfully)

**Manual** (Progress section): All 17 manual checkboxes across Phase 1-3 are marked `[x]` with commit SHAs. Spot-checked against the actual diff/code (not rubber-stamped) — 401 guards, length validation, config-unconfigured banner path, accept/reject/edit flow, `source`/`was_edited` persistence, empty/complete study states, and PROTECTED_ROUTES entries are all present and correct in the code as verified during this review.

## Notes

- This review covers only the diff attributable to this plan's commits (`fe84e1f^..5525247`). The current `src/pages/api/flashcards/index.ts` also contains a `GET` handler and `src/components/Topbar.astro`/`src/types.ts` contain additional entries (`ListFlashcardsResponse`, `/flashcards/manual` link, etc.) — these were added by the later, separate `flashcard-management-list` and `manual-flashcard-creation` changes (confirmed via `git log`) and are out of scope here.
- No CRITICAL findings. No security vulnerabilities (SQL/XSS/injection), no hardcoded secrets, no missing authn/authz found — every new route independently checks `context.locals.user`, `user_id` is always server-set, and CHECK-constraint-matching length validation exists on both the generate and save paths.

## Triage Summary (2026-09-09)

All 6 findings triaged and resolved:

- **Fixed**: F1 (plan.md addendum), F2 (added `zod`, refactored 3 routes), F3 (cards.length cap), F5 (defensive slice), F6 (unmount guard)
- **Accepted as risk**: F4 (documented in plan.md's Performance Considerations)

Verification after all fixes: `npx astro check` (0 errors), `npm run lint` (clean), `npm run build` (succeeds).
