# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-12

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/` (14 commits/30d — sufficient signal). Top dirs: `src/pages/api` (15 commits), `src/components/flashcards` (13), `src/components/auth` (6), `src/lib/services` (3).

Note: the Phase 2 interview was skipped at the user's direction on the first pass. This rollout leans on the PRD, roadmap, the four implemented slices' `plan.md` files, and their `reviews/impl-review.md` findings instead of live user concerns — several risks below trace directly to bugs or accepted risks those documents already surfaced.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | An authenticated user reads, edits, deletes, or grades another user's flashcard by calling an API route directly with that row's id (IDOR) | High | Medium | PRD Access Control ("a user can only see, edit, and delete their own flashcards"); hot-spot dir `src/pages/api` (15 commits/30d, most-churned area — each route independently hand-rolls its own auth check rather than sharing one) |
| 2 | Grading a card produces scheduling fields that don't match the spaced-repetition algorithm's actual contract (wrong interval direction, missed lapse increment on failure) | High | Medium | `ai-generate-review-study-loop/plan.md` (installed SR library's card contract already changed once, undetected until implementation — see Key Discoveries addendum); PRD FR-009 (SR integration is the product's core differentiator, per roadmap North Star) |
| 3 | An AI-generated flashcard candidate the user accepts unmodified fails to save, surfacing a raw database constraint error instead of succeeding | Medium | Medium | `ai-generate-review-study-loop/plan.md` Key Discoveries (failure mode explicitly anticipated at planning time); hot-spot dir `src/lib/services` |
| 4 | One authenticated user's repeated calls to the AI-generation route run up real provider cost with nothing bounding the rate | Medium | Medium | `ai-generate-review-study-loop/plan.md` Performance Considerations addendum (explicitly accepted, currently unmitigated) |
| 5 | An AI-provider failure mode (timeout, malformed output, unconfigured credential) surfaces as a generic crash instead of a clear, distinct user-facing state | Medium | Medium | PRD NFR ("visible feedback... must not feel broken or hung"); `ai-generate-review-study-loop/plan.md` Phase 1 failure-reason taxonomy |
| 6 | Rapid double-activation of a save/delete/grade action fires a second network mutation, or updates state on an already-unmounted component | Low | High | `reviews/impl-review.md` (same bug independently found and fixed 3 separate times across the review/study/list slices); hot-spot dir `src/components/flashcards` (13 commits/30d) |
| 7 | Whitespace-only question/answer text bypasses validation via a direct API call and gets persisted | Low | Medium | `reviews/impl-review.md` (same gap independently found and fixed in 2 separate routes; reviewer flagged it as worth a standing rule across all content routes) |

**Impact × Likelihood rubric** — High: user loses access, data, or money, or failure is publicly visible / area changes weekly or already burned us. Medium: feature degrades with a workaround, or touched occasionally with a history of bugs. Low: cosmetic or no data effect, or stable/rarely touched.

Rows 1 and 4 are the abuse/security-lens rows (authorization/IDOR; resource abuse via unbounded cost-incurring calls) — both real surfaces for this product (auth + AI-generation with unmetered usage) rather than boilerplate.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | An authenticated user cannot read, update, delete, or grade another user's flashcard via any route, even when passing that row's id directly | "We already checked this in impl-review, so it's covered" — a one-time manual review is not a regression guard; the next new route or a swapped client could silently reintroduce the gap | Whether every flashcard/study route relies on an RLS-scoped client only, or if a service-role client is used anywhere; enumerate all such routes | integration (two seeded users, cross-user access attempt) | Asserting only the no-auth 401 case without ever testing the cross-user 403/404 case — that's the actual gap this risk targets |
| #2 | Grading with each of the four ratings moves scheduling fields in the direction the SR algorithm's own contract guarantees (e.g., a failing grade shortens the next interval and increments the lapse count from a review state; an easy grade lengthens it), independent of what the code currently outputs | "Manual spot-checks already confirmed this looks plausible" — plausible output isn't a pinned, independently-sourced expectation, and the library's contract already changed once without the plan anticipating it | The exact card-mapping function and which library version/params are pinned | unit (pure function, no network/DB needed) | Asserting the exact field values the code currently produces (oracle problem) instead of the documented behavioral invariant (direction of change) |
| #3 | A candidate whose question/answer exceeds the table's length limits is truncated (not silently dropped or passed through) before the save step, so accepting it unmodified never produces a raw DB error | "The AI usually returns short text so this rarely matters" — test at and over the boundary lengths explicitly | The current validation/truncation contract and the DB's actual length bounds | unit | Asserting against whatever the function currently returns instead of the independently documented bound |
| #4 | Repeated rapid calls to the generation route by one authenticated user are bounded rather than unbounded | "No real traffic yet, so this isn't urgent" — the risk is that nothing stops it today, regardless of current traffic | Whether any throttling exists anywhere in the request path today (plan says none) | integration | Writing a test that only documents "no rate limit exists" as if that were success, instead of driving toward an actual bound |
| #5 | Each AI-generation failure mode (unconfigured credential, upstream failure, timeout, non-conformant output) surfaces its own correct, distinct user-facing outcome | "The happy path works in manual testing, so parsing is fine" — the failure branches are exactly what manual testing skips | The current failure-reason taxonomy and its mapping to HTTP status / UI message | unit (mocked fetch, one case per failure reason) | Mocking the provider response so loosely the test would still pass if the parsing logic were deleted entirely |
| #6 | Rapid double-activation of a save/delete/grade action results in exactly one persisted mutation, and no state update fires against an unmounted component | "It's just a dev-mode warning, so it doesn't matter" — the recurring nature (3 independent fixes) is the actual risk, not any single instance's blast radius | The current guard pattern and whether it's applied consistently or ad hoc per component | component/unit (simulate rapid double-activation and unmount-during-await) | Testing only that a guard variable got set, rather than the observable behavior (no double network call, no post-unmount error) |
| #7 | Submitting whitespace-only content via a direct API call is rejected by every flashcard-content route, not only the ones already patched | "The UI already trims, so this is covered" — the whole risk is a direct API call bypassing the UI | Which routes share one validation schema vs. hand-roll their own today | unit/integration per route (or one shared-schema test if a shared schema exists) | Writing the assertion by reading the current trim call instead of asserting the independent business rule ("no blank cards") |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Critical-path coverage | Bootstrap Vitest; defend the authorization boundary and SR scheduling correctness that the core product bet depends on | #1, #2 | unit + integration | change opened | `context/changes/testing-critical-path-coverage/` |
| 2 | Input & data-integrity hardening | Close the candidate-length and generation-cost gaps the implementation plan already flagged as accepted risk | #3, #4 | unit + integration | not started | — |
| 3 | Hot-spot regression guard | Stop the two bug classes review has already caught 3× and 2× from recurring a 4th time | #6, #7 | component/unit | not started | — |
| 4 | External-boundary resilience | Every AI-provider failure mode maps to a distinct, correct user-facing outcome; add an optional AI-native quality-signal layer for generated-flashcard semantic quality | #5 | unit + optional AI-native | not started | — |
| 5 | Quality-gates wiring | Wire the new unit/integration suite into CI as a required gate; add e2e coverage on the two critical flows | cross-cutting | gates + e2e | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — see Phase 1 | Plain Vitest covers pure-function and mocked-fetch tests (scheduler mapping, validation schemas, service error paths) without needing workerd; reach for `@cloudflare/vitest-plugin` (renamed from `@cloudflare/vitest-pool-workers`, Aug 2026, needs Vitest 4.1+) only if a future test needs real workerd bindings |
| API mocking | native `vi.fn()` / mocked `fetch` | none yet — see Phase 1 | No external HTTP client library exists in this codebase (plain `fetch`); no MSW needed at this scale |
| e2e | Playwright | none yet — see Phase 5 | Configure via `webServer` running `npm run preview`; Astro's `--ignore-lock` flag (2026) allows concurrent preview servers if parallel e2e runs are ever needed |
| accessibility | axe-core (via `@axe-core/playwright`) | none yet — optional, not scheduled | Not justified as a standalone phase at current scope; revisit if an accessibility complaint surfaces |
| (optional) AI-native | LLM-as-judge eval harness over generated flashcard quality — checked: 2026-09-12 | n/a | When NOT to use: never per-PR or CI-blocking (cost + nondeterminism); use only as a periodic, manual quality check when the generation prompt or model changes, to sanity-check semantic quality that schema/length validation can't catch |

**Stack grounding tools (current session):**
- Docs: none available in current session (no Context7 or framework-docs MCP exposed) — used WebSearch to confirm current Cloudflare/Astro testing guidance instead; checked: 2026-09-12
- Search: web search MCP — confirmed `@cloudflare/vitest-pool-workers` was renamed `@cloudflare/vitest-plugin` (Aug 2026) and Astro's Playwright `webServer` + `--ignore-lock` guidance; checked: 2026-09-12
- Runtime/browser: none available in current session (no Playwright/browser MCP exposed) — not used; checked: 2026-09-12
- Provider/platform: Supabase MCP is installed but not authenticated this session — not used; no GitHub MCP detected; checked: 2026-09-12

Use docs MCPs for current framework/library APIs and setup details. Use
search MCPs for discovery or current status only, then prefer official docs
as the evidence. Do not use MCP docs/search to infer code failure anchors;
those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck | local + CI | required (already wired — `npm run lint`, `npx astro check` in `.github/workflows/ci.yml`) | syntactic / type drift |
| unit + integration | local + CI | required after §3 Phase 1 | authorization, scheduling, and validation logic regressions |
| e2e on critical flows | CI on PR | required after §3 Phase 5 | broken auth and generate→review→save→study paths |
| post-edit hook | local (agent loop) | recommended after §3 Phase 3 | regressions at edit time for the recurring unmount/validation bug classes |
| visual diff (deterministic) | CI on PR | optional | rendering regressions |
| multimodal visual review | CI on PR | optional, selective (review-candidates screen, study session screen — 2 screens max) | visual issues classic diff misses |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (Workers CPU cap, `astro/cloudflare#16190` per `infrastructure.md`) |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 1 (authorization + SR-scheduling pattern) and §3 Phase 2 (candidate-validation pattern).

### 6.2 Adding an integration test

- TBD — see §3 Phase 1 (cross-user authorization pattern).

### 6.3 Adding an e2e test

- TBD — see §3 Phase 5.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1.

### 6.5 Adding a test for the AI-generation boundary

- TBD — see §3 Phase 4.

### 6.6 Per-rollout-phase notes

(Optional. After each phase lands, `/10x-implement` appends a 2-3 line note
here capturing anything surprising the rollout phase taught.)

## 7. What We Deliberately Don't Test

Interview Q5 was skipped this pass; exclusions below are derived from PRD non-goals instead.

- **The SR library's own internals** — trusting a ready-made, external spaced-repetition algorithm (rather than building one) is a PRD non-goal; this rollout tests our mapping *to* the library's contract (Risk #2), not the library's own correctness. Re-evaluate if the library is ever swapped or forked.
- **Multi-format import (PDF, DOCX, etc.)** — out of scope per PRD non-goals; only copy-paste text is supported.
- **Cross-user sharing of flashcard sets** — PRD non-goal; the flat, private-by-default access model is what Risk #1 protects, not a sharing feature.
- **Integrations with other educational platforms (LMS, etc.)** — PRD non-goal.
- **Mobile apps** — PRD non-goal; web only.
- **Load/performance testing beyond the already-tracked Workers CPU-cap risk** — that risk is an ops/infrastructure concern (`infrastructure.md`), mitigated by a paid-plan upgrade, not by a test.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-12
- Stack versions last verified: 2026-09-12
- AI-native tool references last verified: 2026-09-12

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
