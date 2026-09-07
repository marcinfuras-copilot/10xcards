---
project: "10xCards"
version: 1
status: draft
created: 2026-08-20
updated: 2026-08-23
prd_version: 1
main_goal: speed
top_blocker: capacity
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Self-directed learners studying technical or professional material already know spaced repetition works, but manually writing high-quality flashcards is tedious enough that most people never start. 10xCards removes that authoring cost by generating flashcard candidates from pasted text via AI, then keeps the accepted cards inside an integrated review-and-study loop — the part a one-off AI chat answer can't offer — so the habit actually sticks.

## North star

**S-01: User pastes text, reviews AI-generated flashcard candidates, and studies the accepted ones in a spaced-repetition session in one sitting** — chosen deliberately as one combined milestone (rather than splitting generation from study) because only the full loop tests the product's actual bet: that pairing low-friction AI generation with an integrated study habit beats a one-off AI chat answer.

> The north star is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as Prerequisites allow because everything else only matters if this works.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                | Prerequisites | PRD refs                             | Status   |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------ | -------------- | ------------------------------------- | -------- |
| F-01 | flashcards-data-foundation       | (foundation) flashcards table + per-user RLS in place                                | —              | Access Control, data-retention NFR    | in-progress |
| S-01 | ai-generate-review-study-loop    | paste text, review AI candidates (accept/edit/reject), save, and study them via SR    | F-01           | US-01, FR-001, FR-002, FR-003, FR-004, FR-009 | in-progress |
| S-02 | manual-flashcard-creation         | manually create a flashcard without going through AI generation                      | F-01           | FR-005                                | proposed |
| S-03 | flashcard-management-list         | browse their saved flashcards, edit one, and delete one                              | F-01           | FR-006, FR-007, FR-008                | proposed |

## Baseline

What's already in place in the codebase as of `2026-08-20` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 SSR + React 19 islands + Tailwind 4 + shadcn/ui scaffolded (`components.json`, `src/components/ui/button.tsx`); pages exist for `/`, `/dashboard`, `/auth/{signin,signup,confirm-email}`. No flashcard UI yet.
- **Backend / API:** partial — Astro SSR on the Cloudflare adapter; only auth API routes exist (`src/pages/api/auth/{signin,signup,signout}.ts`). No AI-generation endpoint.
- **Data:** partial — Supabase JS client wired (`src/lib/supabase.ts` via `@supabase/ssr`); no `supabase/migrations/`, no ORM, no flashcards schema anywhere.
- **Auth:** present — Supabase auth end-to-end (signup/signin/signout API + pages), `src/middleware.ts` verifies session per request and protects `/dashboard`.
- **Deploy / infra:** partial — `wrangler.jsonc` already correctly targets a Cloudflare Worker (not Pages) per `infrastructure.md`; CI (`.github/workflows/ci.yml`) runs lint + build but has no deploy step. `infrastructure.md` flags the Workers free-tier 10ms CPU cap as a real risk for the not-yet-built AI-generation route and recommends budgeting the $5/mo paid plan before that route ships.
- **Observability:** absent — no logging library, error tracking, or metrics config anywhere in the codebase.

## Foundations

### F-01: Flashcards data foundation

- **Outcome:** (foundation) a flashcards table exists with row-level security scoped to the owning user, and the minimal fields needed to track review state (accepted/edited) and spaced-repetition scheduling. Per the PRD's data-retention NFR, it stores the derived question/answer pair, not the raw pasted source text.
- **Change ID:** flashcards-data-foundation
- **PRD refs:** Access Control (flat user model, own-data-only), data-retention NFR ("source text ... not retained or used beyond that purpose")
- **Unlocks:** S-01, S-02, S-03 — every vertical slice needs a place to persist and query flashcards
- **Prerequisites:** — (auth already present per Baseline, providing the `user_id` to key RLS on)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kept intentionally minimal — just enough schema to unblock S-01 — rather than pre-designing every field an eventual SR-library integration might want. Deferring exact field shape to `/10x-plan` avoids over-designing before the first vertical slice proves out what it actually needs; a small follow-up migration is cheap pre-launch if S-01 needs to add fields.
- **Status:** in-progress

## Slices

### S-01: AI generate → review → save → study loop

- **Outcome:** user can paste source text, receive AI-generated flashcard candidates, review each one (accept/edit/reject), have accepted cards saved to their account, and start a spaced-repetition study session over them.
- **Change ID:** ai-generate-review-study-loop
- **PRD refs:** US-01, FR-001 (existing login, exercised by this slice's "Given a logged-in user"), FR-002 (same), FR-003, FR-004, FR-009, plus both NFRs (visible feedback within seconds; source text used only for generation)
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03
- **Blockers:** Possible need to upgrade to the $5/mo Cloudflare Workers paid plan before this route carries real traffic — the free tier's 10ms CPU cap is flagged in `infrastructure.md` as a real risk for AI-response parsing, not a hypothetical one.
- **Unknowns:** —
- **Risk:** Bundles the two technically heaviest FRs in the MVP — the AI generation call and the spaced-repetition algorithm integration — into a single slice. That's a deliberate choice (confirmed in framing) to fully validate the retention-loop hypothesis in one milestone, even though it's the largest single planning unit in the roadmap under a capacity-constrained (solo, after-hours) team. If `/10x-plan` finds it too broad for one pass, split along generate+review vs. save+study at that time.
- **Status:** in-progress

### S-02: Manual flashcard creation

- **Outcome:** user can manually create a flashcard directly, without going through AI generation.
- **Change ID:** manual-flashcard-creation
- **PRD refs:** FR-005
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Smallest, most isolated slice in the roadmap — a plain form-plus-save with no AI or SR dependency. A natural pressure-release valve if capacity turns out tighter than expected and S-01 needs to be trimmed or delayed.
- **Status:** proposed

### S-03: Flashcard management list

- **Outcome:** user can browse their saved flashcards, edit an existing one, and delete one.
- **Change ID:** flashcard-management-list
- **PRD refs:** FR-006, FR-007, FR-008
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Grouped as one slice because the PRD itself groups FR-006/007/008 under one "Flashcard management" area, and view/edit/delete naturally share a single list UI (you edit or delete against the list you're viewing). Splitting further would add planning overhead without a real vertical benefit.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                     | Suggested issue title                                    | Ready for `/10x-plan` | Notes                          |
| ---------- | ------------------------------ | ---------------------------------------------------------- | ---------------------- | ------------------------------- |
| F-01       | flashcards-data-foundation     | Add flashcards data schema + RLS foundation                | yes                    | Issue: #1                        |
| S-01       | ai-generate-review-study-loop  | AI generate → review → save → study loop (north star)      | no                     | Issue: #2 (waiting on F-01)      |
| S-02       | manual-flashcard-creation      | Manual flashcard creation                                  | no                     | Issue: #3 (waiting on F-01)      |
| S-03       | flashcard-management-list      | Flashcard list: view, edit, delete                         | no                     | Issue: #4 (waiting on F-01)      |

## Open Roadmap Questions

None — the PRD reports 0 open questions, and the framing interview did not surface any new cross-cutting question spanning multiple slices.

## Parked

- **Custom spaced-repetition algorithm** — Why parked: PRD Non-Goal; building one is a large, separate engineering effort with no MVP payoff, an existing ready-made algorithm is integrated instead (FR-009).
- **Multi-format import (PDF, DOCX, etc.)** — Why parked: PRD Non-Goal; only copy-paste text input is supported in the MVP.
- **Sharing flashcard sets between users** — Why parked: PRD Non-Goal; each user's flashcards stay private to their own account.
- **Integrations with other educational platforms (LMS, etc.)** — Why parked: PRD Non-Goal; out of scope for MVP.
- **Mobile apps** — Why parked: PRD Non-Goal; web only for now.

## Done

(No items yet — `/10x-archive` appends here when a matching change is archived.)
