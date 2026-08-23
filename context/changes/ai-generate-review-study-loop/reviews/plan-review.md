<!-- PLAN-REVIEW-REPORT -->
# Plan Review: AI Generate → Review → Save → Study Loop Implementation Plan

- **Plan**: context/changes/ai-generate-review-study-loop/plan.md
- **Mode**: Deep
- **Date**: 2026-08-22
- **Verdict**: REVISE
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | FAIL |

## Grounding

5/5 existing paths ✓, 9/9 new-file paths conflict-free ✓, 4/4 symbols ✓ (PROTECTED_ROUTES, configStatuses, envField, FlashcardInsert/Update/FsrsState), brief↔plan ✓

## Findings

### F1 — Phase 1 Progress section merges two success criteria into one row

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 Manual Verification / Progress → Phase 1 → Manual
- **Detail**: Phase 1's Manual Verification lists 4 distinct bullets (lines 121-124): valid-request success, under/over-length → 400, unauthenticated → 401, unconfigured key → error+banner. The Progress section only has 3 manual rows (1.4-1.6) — row 1.5 ("Under/over length input returns 400; unauthenticated request returns 401") silently merges two separate criteria into one checkbox. Per the mechanical Progress↔Phase contract, every Success Criteria bullet needs its own `- [ ] N.M` row.
- **Fix**: Split row 1.5 into two rows and renumber the trailing row: 1.4 (unchanged) → 1.5 "Under/over length input returns 400" → 1.6 "Unauthenticated request returns 401" → 1.7 (was 1.6) "Unconfigured OPENROUTER_API_KEY returns a clear error and shows the sitewide config banner".
- **Decision**: FIXED

### F2 — OpenRouter structured-output schema may need an object root, not a bare array

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1, Changes Required #3 (OpenRouter generation service)
- **Detail**: The contract says the service requests "an array of {question, answer} pairs (schema maxItems: 20)" — read literally, that's a top-level `type: "array"` JSON schema. OpenRouter's own structured-outputs documentation shows the schema root as `type: "object"` with named properties; several providers' strict-mode implementations require an object root and reject (or silently mishandle) a bare top-level array. Building this literally risks a Phase 1 rework cycle discovered only against the live API.
- **Fix**: Wrap the array in an object schema — e.g. `{ type: "object", properties: { flashcards: { type: "array", items: { question, answer }, maxItems: 20 } }, required: ["flashcards"] }` — and parse `response.flashcards` in the service, matching OpenRouter's documented shape.
- **Decision**: FIXED

### F3 — No error-handling behavior specified for a failed grade submission

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3, Changes Required #7 (StudySession UI)
- **Detail**: Phases 1 and 2 both spell out explicit error-response handling (400/401/5xx → inline error/retry). Phase 3 §7's contract for submitting a grade only describes the happy path — "selecting one calls POST /api/study/review, then advances to the next card" — with no stated behavior if that POST fails (network blip, 5xx). As written, an implementer could reasonably advance to the next card regardless of the response, silently losing the grade.
- **Fix**: State that a failed `POST /api/study/review` shows an inline error with retry (mirroring Phase 1/2's pattern) and does NOT advance to the next card until the grade succeeds.
- **Decision**: FIXED

### F4 — New nav links are reachable right after sign-in but disappear on /dashboard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 #9 / Phase 3 #8 (Topbar navigation)
- **Detail**: Verified via grep: `Topbar.astro` is only rendered by `Welcome.astro`, which only `index.astro` uses. `signin.ts` redirects to `/` after login, so Topbar *is* the right landing surface immediately post-signin — that part is sound. But `dashboard.astro` (linked from Topbar) has no navigation of its own beyond a sign-out button — once a user clicks through to `/dashboard`, the new `/flashcards/new` and `/study` links are gone, with only browser-back to recover them.
- **Fix**: Also render `Topbar` (or duplicate the same two links) on `src/pages/dashboard.astro`.
- **Decision**: FIXED

### F5 — Generation request timeout has no concrete value

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Changes Required #3
- **Detail**: "apply a request timeout" names no value, leaving the implementer to pick one.
- **Fix**: Specify a concrete timeout (e.g. 20s) in the contract.
- **Decision**: FIXED
