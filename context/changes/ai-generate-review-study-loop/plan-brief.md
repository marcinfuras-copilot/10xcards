# AI Generate → Review → Save → Study Loop — Plan Brief

> Full plan: `context/changes/ai-generate-review-study-loop/plan.md`

## What & Why

Build the product's north-star slice: a logged-in user pastes source text, gets AI-generated flashcard candidates back, reviews each one (accept/edit/reject), has accepted cards saved to their account, and can immediately start a spaced-repetition study session over them. This is the one milestone that actually tests the product's core bet — that low-friction AI generation plus an integrated study habit beats a one-off AI chat answer.

## Starting Point

The `flashcards` table (F-01) already exists with RLS and FSRS-shaped columns, but nothing else in this slice exists yet: no `ts-fsrs` dependency, no OpenRouter integration, no JSON API convention (existing routes are all form-post + redirect for auth), and no flashcard UI of any kind.

## Desired End State

A signed-in user can reach a "Generate flashcards" page, paste text, review AI candidates in a list (accept/reject/edit via a modal), save the accepted ones, then go to a "Study" page and grade due cards one at a time (Again/Hard/Good/Easy) until the session is complete.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Plan scope | One plan, 3 phases (not split into separate changes) | Matches the roadmap's "prove the full loop in one milestone" framing; phases already give incremental checkpoints | Plan |
| Client/server pattern | JSON API routes + client-side React state | First interactive multi-step flow in this codebase — form-post-per-candidate would be slow/jarring | Plan |
| AI failure handling | Synchronous call, inline error + retry | Simplest to implement; matches PRD's happy-path-only scope for this milestone | Plan |
| Cloudflare CPU-cap risk | Accepted at the infra level (paid plan), not engineered around in code | Matches the team's already-documented mitigation (infrastructure.md); avoids scope creep in this plan | Plan |
| Candidate persistence before accept | Client-side React state only, nothing written to DB | Best fit for the data-retention NFR; no schema reopen | Plan |
| Candidate editing UX | Modal dialog (new shadcn `dialog` component) | More room for validation feedback than inline editing | Plan |
| Study rating scale | Native FSRS 4-button (Again/Hard/Good/Easy) | Maps 1:1 onto `ts-fsrs`, matches F-01's schema design, standard SR-app UX | Plan |
| AI output format | OpenRouter structured output (JSON schema) | Avoids fragile regex parsing — directly helps with the Workers CPU-cap risk | Plan |
| Automated testing | None added; manual verification only | Consistent with F-01's precedent; avoids new tooling decisions mid-slice | Plan |
| Input validation | Client + server (length bounds, disable-while-pending) | Matches existing `FormField`/`SubmitButton` patterns; satisfies the "feels responsive" NFR | Plan |

## Scope

**In scope:**
- OpenRouter-backed generation endpoint with structured JSON output
- Full review UI: paste, candidate list, accept/reject, edit-via-modal
- Save endpoint persisting accepted candidates with correct `source`/`was_edited`
- `ts-fsrs` integration: due-cards endpoint, grade-submission endpoint, one-card-at-a-time study session UI

**Out of scope:**
- Manual flashcard creation (S-02) and the browse/edit/delete list (S-03)
- Persisting per-review history/logs — only current scheduling state is kept
- Persisting unreviewed AI candidates — review state is client-side only
- Streaming AI responses, async job/polling architecture, or new infra (KV, queues) for the CPU-cap risk
- A test runner / automated tests for AI parsing or FSRS logic

## Architecture / Approach

Three vertically-testable phases: (1) an isolated AI generation service + JSON route, (2) the review UI wired end-to-end through a save endpoint into `public.flashcards`, and (3) the study session (`ts-fsrs` scheduling service + due/grade endpoints + UI), since study's backend and UI are too tightly coupled to split further. New React islands call new JSON API routes directly via `fetch` — the first departure from this codebase's existing form-post-and-redirect convention, chosen because reviewing/grading multiple items via full-page reloads would be slow.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. AI Generation Backend | OpenRouter env wiring, generation service with structured output + validation, `/api/flashcards/generate` | Structured-output model support varies by provider — must confirm the chosen model actually supports it |
| 2. Review UI & Save | Paste/review/edit/save UI, `/api/flashcards` save endpoint | First JSON API + client-state pattern in this codebase — no precedent to lean on |
| 3. Spaced-Repetition Study Session | `ts-fsrs` dependency, scheduling service, due/grade endpoints, study session UI | Verifying FSRS scheduling correctness is manual/eyeball-only (no automated tests) |

**Prerequisites:** F-01 (`flashcards-data-foundation`) — done.
**Estimated effort:** ~2-3 sessions across 3 phases (largest single planning unit in the roadmap, by design).

## Open Risks & Assumptions

- Assumes the Cloudflare Workers paid plan is enabled before this route carries real traffic; if it isn't, the generation route may fail unpredictably under the free tier's 10ms CPU cap — an ops task outside this plan's control.
- Assumes a specific OpenRouter model (chosen during Phase 1 implementation) reliably supports structured JSON output; if it doesn't in practice, Phase 1 may need a different model or a fallback parsing strategy.
- No automated regression safety net for the AI-response parser or the FSRS scheduling wrapper — future changes to either rely on manual re-verification.

## Success Criteria (Summary)

- A user can go from pasting text to a saved, correctly-tagged set of flashcards without leaving the review UI.
- Accepted cards immediately enter the study queue and can be graded through a full FSRS session with plausible scheduling updates.
- All three phases pass `npx astro check`, `npm run lint`, and `npm run build`.
