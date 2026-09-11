---
change_id: testing-critical-path-coverage
title: Critical-path test coverage — authorization and SR scheduling
status: planned
created: 2026-09-12
updated: 2026-09-12
archived_at: null
---

## Notes

Sourced from `context/foundation/test-plan.md`, Rollout Phase **1** ("Critical-path coverage") — the first rollout phase in the test-plan orchestrator's phased rollout.

- **Outcome:** the two highest-priority risks in the test plan are defended at the cheapest test layer, and Vitest is bootstrapped as this project's first test runner (none exists yet).
- **Risks covered:**
  - **#1** — an authenticated user reads, edits, deletes, or grades another user's flashcard by calling an API route directly with that row's id (IDOR). Impact: High, Likelihood: Medium.
  - **#2** — grading a card produces scheduling fields that don't match the spaced-repetition algorithm's (`ts-fsrs`) actual contract (wrong interval direction, missed lapse increment). Impact: High, Likelihood: Medium.
- **Test types planned:** unit + integration.
- **Risk response intent** (from test-plan.md §2 Risk Response Guidance):
  - **#1** — prove an authenticated user cannot read/update/delete/grade another user's flashcard via any route, even when passing that row's id directly. Must challenge: "impl-review already checked this once, so it's covered" — a one-time manual review is not a regression guard. Cheapest layer: integration test with two seeded users.
  - **#2** — prove grading with each of the four ratings (Again/Hard/Good/Easy) moves scheduling fields in the direction the SR algorithm's own contract guarantees, independent of what the code currently outputs. Must challenge: "manual spot-checks already confirmed this looks plausible" — the library's card contract already changed once (`learning_steps` field) without the plan anticipating it. Cheapest layer: unit test on the scheduler mapping function (pure, no network/DB).
- **PRD refs:** Access Control (flat user model, own-data-only); FR-009 (SR integration is the product's core differentiator).
- **Prerequisites:** none — `flashcards-data-foundation`, `ai-generate-review-study-loop`, `manual-flashcard-creation`, and `flashcard-management-list` are all already implemented; this change tests existing behavior, it does not add product features.
