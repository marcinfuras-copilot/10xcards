<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manual Flashcard Creation Implementation Plan

- **Plan**: context/changes/manual-flashcard-creation/plan.md
- **Scope**: Phase 1, 2 of 2 (full plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Whitespace-only question/answer can be persisted via `manual.ts`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/flashcards/manual.ts:14-19` (`isValidRequest`), `:46-51` (insert row)
- **Detail**: Validation checks raw `question.length > 0`/`answer.length > 0`, not trimmed length, and the insert uses the raw untrimmed values. A direct API call (curl/Postman, bypassing the UI) with `{"question": "   ", "answer": "x"}` passes validation and gets inserted — the DB's `char_length(...) between 1 and 500` CHECK constraint is also satisfied by whitespace. Not reachable through the UI (`ManualCreateForm.tsx` already trims before sending and correctly gates `isValid` on trimmed length), and impact is limited to the authenticated user polluting their own data (RLS still scopes rows). This is the same gap already found and fixed in `[id].ts` (via zod's `.trim().min(1)`) during the `flashcard-management-list` review — `manual.ts` predates that fix and wasn't covered by it.
- **Fix**: Check `question.trim().length > 0 && answer.trim().length > 0` in `isValidRequest`, and insert `body.question.trim()`/`body.answer.trim()` instead of the raw values.
- **Decision**: FIXED — `isValidRequest` now checks trimmed length, and the insert stores `body.question.trim()`/`body.answer.trim()`. Verified with `npx astro check`, `npm run lint` (both pass).

### F2 — `ManualCreateForm.tsx`'s validation-timing deviates from the plan's literal "matching `EditCandidateDialog.tsx`" wording

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/flashcards/ManualCreateForm.tsx:28-44`
- **Detail**: The plan's Phase 2 contract says validation should match `EditCandidateDialog.tsx`'s rules, which shows "Question/Answer is required" immediately whenever the trimmed value is empty (including on a pristine, untouched field). The current implementation — via a documented follow-up commit (`c2b932d`, "don't show required-field errors before user input") — instead only shows the "required" error once a field has non-empty-but-whitespace content (i.e., typed-then-cleared), mirroring `GenerateForm.tsx`'s convention instead. This is a genuine, intentional behavioral divergence from the plan's literal wording, but it's well-motivated, already shipped with a clear commit message, and verified correct: `isValid` (lines 40-44) still correctly gates submission on trimmed length regardless of which error-message timing is used, so a whitespace-only submission is still blocked client-side.
- **Fix**: None required in code. Optionally amend `plan.md`'s Phase 2 contract with an addendum noting the validation-timing follows `GenerateForm.tsx`'s convention (not-yet-touched fields show no error) rather than `EditCandidateDialog.tsx`'s immediate-error convention, so the plan accurately reflects the shipped behavior.
- **Decision**: FIXED — added an addendum to `plan.md`'s Phase 2 contract documenting the validation-timing follows `GenerateForm.tsx`'s convention (per commit `c2b932d`), noting `isValid` independently guarantees whitespace-only submissions are still blocked.

### F3 — `manual.ts` uses hand-rolled validation instead of the now-current `zod` convention

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/flashcards/manual.ts:14-21`
- **Detail**: The `zod` convention across the flashcards API routes was introduced the day after this file was written (2026-09-09 vs. 2026-09-08), so this wasn't a violation of an existing rule at the time. `manual.ts` is now the only remaining flashcards route using hand-rolled validation (`index.ts`'s `POST`, `index.ts`'s `GET` has no body, and `[id].ts` all use zod).
- **Fix**: Optionally migrate to a zod schema next time this file is touched — this would also naturally fold in F1's `.trim()` fix, matching how `[id].ts`'s zod migration folded in its own trim fix during the `flashcard-management-list` review.
- **Decision**: FIXED — replaced `isValidRequest` with `createRequestSchema` (`z.string().trim().min(1).max(...)` for both fields, subsuming F1's fix); `parsed.data.question`/`parsed.data.answer` used directly in the insert. Verified with `npx astro check`, `npm run lint`, `npm run build` (all pass).

## Success Criteria Verification

**Automated** (run for the full plan):
- `npx astro check` — PASS (0 errors, 0 warnings, 5 hints — same pre-existing hints unrelated to this change)
- `npm run lint` — PASS (clean)
- `npm run build` — PASS (production build completes)

**Manual** (Progress section): All 8 manual checkboxes across Phase 1-2 are marked `[x]` with commit SHAs. Spot-checked against the actual code (not rubber-stamped) — both sub-agents independently confirmed: 401 checks and server-set `user_id` in `manual.ts`; the corrected `isValid` computation in `ManualCreateForm.tsx` genuinely blocks whitespace-only submission through the UI; `/flashcards/manual` is covered by the `/flashcards` prefix in `PROTECTED_ROUTES`; the nav link is present and correctly styled.

## Notes

- No CRITICAL findings. No missing implementation, no scope creep — exactly the 5 files named in the plan were touched (plus the 3 context docs), and a later, separate, well-documented fix commit (`c2b932d`) improved the form's validation-timing UX without breaking anything.
- **Cross-cutting observation (out of scope for this review, flagged for awareness)**: the safety/quality sub-agent noted that `src/pages/api/flashcards/index.ts`'s `POST` handler — reviewed and migrated to zod under a *different* change (`ai-generate-review-study-loop`'s F2 fix, commit `d1e3e1b`) — has the same untrimmed-validation gap as F1 here (`z.string().min(1)` without `.trim()`). That file is out of scope for this review, but this is now a recurring pattern across two changes (this one and that one) worth a `/10x-lesson` entry: "trim-before-validate isn't yet a consistently applied rule across all flashcard-content routes."
- Two additional low-priority items surfaced by the safety/quality sub-agent were judged not to warrant formal findings: (1) `ManualCreateForm.tsx`'s "Saved! (N so far)" banner persists across subsequent edits — read as an intentional running counter given its wording, not a stale-toast bug; (2) `ManualCreateForm.tsx` lacks the `mountedRef`/`isMounted()` unmount guard used in `ReviewSession.tsx`/`StudySession.tsx`/the flashcard dialogs, but unlike those components this form is the sole content of a full-page MPA route with no conditional-unmount scenario, so real-world exposure is genuinely negligible here.

## Triage Summary (2026-09-09)

All 3 findings triaged and resolved:

- **Fixed**: F1 (trimmed-length validation in `manual.ts` — later folded into F3's zod migration), F2 (documented the validation-timing addendum in `plan.md`), F3 (migrated `manual.ts` to a zod schema, subsuming F1)

Verification after all fixes: `npx astro check` (0 errors), `npm run lint` (clean), `npm run build` (succeeds).
