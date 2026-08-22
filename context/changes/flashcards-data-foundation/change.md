---
change_id: flashcards-data-foundation
title: Flashcards data foundation
status: implemented
created: 2026-08-22
updated: 2026-08-22
archived_at: null
---

## Notes

Sourced from `context/foundation/roadmap.md`, Roadmap ID **F-01** (foundation, unlocks all vertical slices).

- **Outcome:** a flashcards table exists with row-level security scoped to the owning user, and the minimal fields needed to track review state (accepted/edited) and spaced-repetition scheduling. Per the PRD's data-retention NFR, it stores the derived question/answer pair, not the raw pasted source text.
- **PRD refs:** Access Control (flat user model, own-data-only), data-retention NFR ("source text ... not retained or used beyond that purpose").
- **Unlocks:** S-01 (`ai-generate-review-study-loop`), S-02 (`manual-flashcard-creation`), S-03 (`flashcard-management-list`) — every vertical slice needs a place to persist and query flashcards.
- **Prerequisites:** none — auth is already present in the codebase, providing the `user_id` to key RLS on.
- **Risk:** kept intentionally minimal per the roadmap — just enough schema to unblock S-01 — rather than pre-designing every field an eventual SR-library integration might want. Exact field shape is deferred to `/10x-plan`; a small follow-up migration is cheap pre-launch if S-01 needs to add fields.
- **Status per roadmap:** ready — this is the first change to plan/implement; S-01/S-02/S-03 are all blocked on it.
