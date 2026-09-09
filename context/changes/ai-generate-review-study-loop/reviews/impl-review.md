<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: AI Generate → Review → Save → Study Loop Implementation Plan

- **Plan**: context/changes/ai-generate-review-study-loop/plan.md
- **Scope**: Phase 1, 2, 3 of 3 (full plan) — follow-up review confirming the F1-F6 fixes from the prior review (commit `d1e3e1b`)
- **Date**: 2026-09-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## What this review covers

The prior review (F1-F6, saved to this same file, all triaged) found 6 issues: an undocumented migration/plan-contract deviation, a missing `zod` convention, an unbounded save-batch size, no rate limiting on the generate route, a missing defensive slice in the OpenRouter parser, and a missing unmount guard in `StudySession.tsx`. All were fixed or explicitly accepted as risk in commit `d1e3e1b`, and `plan.md` was amended with addenda. This review independently re-verifies that:

1. Every plan addendum accurately describes what's actually in the code (no "documented but not true" drift).
2. The fix commit itself introduced no new regressions, scope creep, or unrelated changes.
3. All automated success criteria still pass.

Two sub-agents did the re-verification: one cross-checked every addendum in `plan.md` against the actual files (migration, `scheduler.ts`, the three refactored routes, `package.json`), the other did a line-level correctness review of the fix commit's diff (zod schema semantics, the `.slice()`/`.max()` caps, the unmount-guard logic) and ran `npx astro check`.

## Findings

### F1 — `ReviewSession.tsx` has the same missing-unmount-guard pattern that was fixed in `StudySession.tsx`, but wasn't itself fixed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/flashcards/ReviewSession.tsx` (`handleGenerate`, `handleSaveAccepted`)
- **Detail**: The prior review's F6 added a `mountedRef`/`isMounted()` guard to `StudySession.tsx`'s `handleGrade` so a `setState` after an `await fetch` doesn't fire post-unmount. `ReviewSession.tsx`'s `handleGenerate` and `handleSaveAccepted` have the structurally identical pattern (async `fetch` → `setState` on completion) and were not touched by the fix commit, since the original finding only named `StudySession.tsx`. Both components are the sole `client:load` root on a single-purpose page with no client-side routing, so real-world exposure is low in both cases (unmounting mid-request requires a full page navigation, which kills the in-flight fetch anyway) — this is genuinely cosmetic/consistency-driven, not a functional risk.
- **Fix**: Add the same `mountedRef`/`isMounted()` guard to `ReviewSession.tsx`'s `handleGenerate` and `handleSaveAccepted`, for consistency with `StudySession.tsx`.
- **Decision**: FIXED — added `mountedRef`/`isMounted()` guard and checked it before each post-await `setState` in both `handleGenerate` and `handleSaveAccepted`. Verified with `npx astro check`, `npm run lint`, `npm run build` (all pass).

## Success Criteria Verification

**Automated** (re-run against current HEAD, post-fix):
- `npx astro check` — PASS (0 errors, 0 warnings, 5 hints — same pre-existing deprecation hints as before, unrelated to this change)
- `npm run lint` — PASS (clean)
- `npm run build` — PASS (production build completes; zod's own source triggers two harmless Rollup comment-annotation warnings, no build failure)

**Manual**: No new phases were added since the last review — all 17 manual checkboxes from the original three phases remain `[x]` with commit SHAs, and the underlying behavior they verify (auth guards, length validation, accept/edit/reject flow, save persistence, study session states) is unchanged by the fix commit, which only touched validation internals and an unmount guard, not observable behavior.

## Re-verification detail (from sub-agent reports)

- **Plan addenda accuracy**: all 4 addenda in `plan.md` (Key Discoveries' `learning_steps` claim, Phase 3's scheduler field list, Performance Considerations' rate-limiting risk acceptance, Migration Notes' "purely additive" characterization) were checked against the actual code/migration/library type defs and confirmed accurate. `node_modules/ts-fsrs/dist/index.d.ts` confirms `learning_steps: number` is indeed non-optional on `Card` in the installed `5.4.2`.
- **zod adoption**: `generate.ts`, `flashcards/index.ts` (POST), and `study/review.ts` all now validate via `.safeParse` against zod schemas; `isValidCard`/`isValidRating` no longer exist anywhere in `src/` (confirmed via grep). `study/due.ts` was correctly left unchanged (GET, no body/params to validate).
- **Schema semantic equivalence**: zod's `.min()`/`.max()` on strings uses `.length` (UTF-16 code units), matching the old manual checks exactly — no off-by-one or behavior change. `z.number()` incidentally rejects `NaN` where the old `typeof x === "number"` check would have let it through — a strictness improvement, not a regression.
- **Cap/slice placement**: `MAX_CARDS_PER_SAVE = 20` in `flashcards/index.ts` and `.slice(0, MAX_CANDIDATES)` in `openrouter.ts` are both correctly placed and don't shadow or conflict with existing constants.
- **Unmount guard logic**: `StudySession.tsx`'s `mountedRef` is only ever flipped `false` in the mount effect's cleanup (i.e., real unmount), and there's no code path where the component stays mounted but `submitting` gets stuck `true` — confirmed by tracing every `setState` call relative to `isMounted()` checks.
- **Scope discipline**: `git show d1e3e1b --stat` touches exactly the 10 files expected from the triage session (plan/report/change docs, `package.json`/`package-lock.json`, and the 5 source files the 5 code-fixing findings named) — no unrelated changes.

## Notes

- No CRITICAL or WARNING findings. The one OBSERVATION (F1) was a leftover consistency gap from the previous triage's narrow scoping (F6 named only `StudySession.tsx`), not a new defect introduced by that session's fixes — now resolved.
- This review's "Scope" line above reuses the fixed report path (`reviews/impl-review.md`) per this skill's save convention; the previous review's fully-triaged findings (F1-F6, decisions FIXED/ACCEPTED) remain in git history at commit `d1e3e1b` and are not repeated here since they're resolved.

## Triage Summary (2026-09-09, follow-up review)

- **Fixed**: F1 (added `mountedRef`/`isMounted()` guard to `ReviewSession.tsx`'s `handleGenerate` and `handleSaveAccepted`)

All findings from both this review and the prior one are now resolved. Verification: `npx astro check` (0 errors), `npm run lint` (clean), `npm run build` (succeeds).
