---
change_id: ai-generate-review-study-loop
title: AI generate, review, save, and study loop
status: implemented
created: 2026-08-22
updated: 2026-09-07
archived_at: null
---

## Notes

Sourced from `context/foundation/roadmap.md`, Roadmap ID **S-01** (the north star slice).

- **Outcome:** user can paste source text, receive AI-generated flashcard candidates, review each one (accept/edit/reject), have accepted cards saved to their account, and start a spaced-repetition study session over them.
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004, FR-009, plus both NFRs (visible feedback within seconds; source text used only for generation).
- **Prerequisites:** F-01 (`flashcards-data-foundation`) — per roadmap Baseline, not yet implemented (no `supabase/migrations/`, no flashcards schema exist yet). This change may not be plannable/implementable until F-01 lands.
- **Blockers:** possible need to upgrade to the $5/mo Cloudflare Workers paid plan before this route carries real traffic — the free tier's 10ms CPU cap is flagged in `infrastructure.md` as a real risk for AI-response parsing.
- **Risk:** bundles the two technically heaviest FRs in the MVP (AI generation call + spaced-repetition algorithm integration) into one slice — a deliberate choice to validate the retention-loop hypothesis in one milestone. If `/10x-plan` finds it too broad for one pass, split along generate+review vs. save+study at that time.
