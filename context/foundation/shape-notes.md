---
project: "10xCards"
context_type: greenfield
created: 2026-08-16
updated: 2026-08-16
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona identity"
      decision: "self-directed learner studying technical/professional material"
    - topic: "pain category"
      decision: "workflow friction (authoring cost blocks adoption of a method that already works)"
    - topic: "product insight"
      decision: "speed of AI generation removes the adoption barrier; integrated review loop beats one-off AI chat answers"
    - topic: "auth strategy"
      decision: "email + password login; flat user model, no roles"
    - topic: "MVP flow"
      decision: "signup -> paste text -> review AI suggestions (accept/edit/reject) -> study via existing SR algorithm; committed to ~3-week after-hours timeline"
    - topic: "domain rule"
      decision: "AI extracts flashcard-worthy facts/concepts from source text (extraction/classification rule), not the SR scheduler"
    - topic: "NFRs"
      decision: "visible feedback within a couple seconds during generation; pasted text used only for that user's own flashcards, not retained beyond that"
    - topic: "product framing"
      decision: "web-app; target scale dozens-to-hundred users (medium); no hard deadline; after-hours-only work"
    - topic: "non-goals"
      decision: "no custom SR algorithm; no multi-format import; no sharing between users; no other-platform integrations; no mobile apps"
  frs_drafted: 9
  quality_check_status: accepted
---

# Shape Notes — 10xCards

## Seed idea (verbatim, from idea-notes.md)

> ## 10xCards - MVP
>
> ### Główny problem
> Manualne tworzenie wysokiej jakości fiszek edukacyjnych jest czasochłonne, co zniechęca do korzystania z efektywnej metody nauki jaką jest spaced repetition.
>
> ### Najmniejszy zestaw funkcjonalności
> - Generowanie fiszek przez AI na podstawie wprowadzonego tekstu (kopiuj-wklej)
> - Manualne tworzenie fiszek
> - Przeglądanie, edycja i usuwanie fiszek
> - Prosty system kont użytkowników do przechowywania fiszek
> - Integracja fiszek z gotowym algorytmem powtórek
>
> ### Co NIE wchodzi w zakres MVP
> - Własny, zaawansowany algorytm powtórek (jak SuperMemo, Anki)
> - Import wielu formatów (PDF, DOCX, itp.)
> - Współdzielenie zestawów fiszek między użytkownikami
> - Integracje z innymi platformami edukacyjnymi
> - Aplikacje mobilne (na początek tylko web)
>
> ### Kryteria sukcesu
> - 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika
> - Użytkownicy tworzą 75% fiszek z wykorzystaniem AI

## Vision & Problem Statement

Self-directed learners who study technical or professional material (documentation, articles, course content) know that spaced repetition is an effective way to retain what they read, but writing high-quality flashcards by hand from that material is tedious enough that most people never start — the authoring cost sits between them and the study method, so they either skip flashcards entirely or abandon the habit after the first few sessions.

The insight this product bets on: the barrier isn't spaced repetition itself, it's the friction of the step before it. People already know the method works; removing the cost of turning source text into flashcards — via AI generation from pasted text — is what gets them to actually start and keep going, where generic one-off AI chat answers don't, because those aren't integrated into a system the learner returns to for ongoing review.

## User & Persona

**Primary persona:** A self-directed learner studying technical or professional material — for example, someone reading documentation, articles, or course content to build or maintain a professional skill. The moment they reach for this product is right after consuming a piece of source material they want to retain long-term: they paste the text in, get flashcards back, and want those cards to feed into a recurring review habit rather than being a one-off artifact.

## Access Control

Login via email + password (or equivalent credential-based login). Flat user model — every account is equal; a user can only see, edit, and delete their own flashcards. No admin or other role exists in the MVP.

## Success Criteria

### Primary
- 75% of AI-generated flashcards are accepted by the user (not rejected/discarded).
- 75% of all flashcards a user creates are created via AI generation (vs. fully manual).

### Secondary
- Users return to study within a week of their first session (recurring habit forms, not a one-time use).

### Guardrails
- Flashcard generation responds within a reasonable time — the paste-text-and-wait step must not feel broken or hung.

## Functional Requirements

### Authentication
- FR-001: User can create an account with email + password. Priority: must-have
  > Socrates: Counter-argument considered: signup before value shown increases drop-off. Resolution: no counter-argument raised; kept as written.
- FR-002: User can log in with email + password. Priority: must-have
  > Socrates: Counter-argument considered: session persistence may not be needed yet. Resolution: no counter-argument raised; kept as written.

### AI flashcard generation
- FR-003: User can paste source text and receive AI-generated flashcard candidates. Priority: must-have
  > Socrates: Counter-argument considered: generic LLM output may be lower quality than hoped, threatening the 75% acceptance target. Resolution: kept as must-have; quality risk is accepted and addressed via prompt/model tuning downstream, not a scope change.
- FR-004: User can review each AI-generated candidate and accept, edit, or reject it before it is saved. Priority: must-have
  > Socrates: Counter-argument considered: auto-save + edit-later could be faster to ship and use. Resolution: kept as must-have; the review gate is central to the 75% acceptance metric — without it there's no clean signal for what AI got right or wrong.

### Manual flashcard creation
- FR-005: User can manually create a flashcard. Priority: must-have
  > Socrates: Counter-argument considered: AI generation already dominates, manual entry may be unneeded complexity. Resolution: kept as must-have; it's the fallback when AI can't handle a topic well, and the 75%-via-AI target already implies 25% will be manual.

### Flashcard management
- FR-006: User can view/browse their flashcards. Priority: must-have
  > Socrates: Counter-argument considered: a full browse UI might be more than MVP needs. Resolution: kept as must-have, scoped to a simple list — no rich search/filter UI implied.
- FR-007: User can edit an existing flashcard. Priority: must-have
  > Socrates: Counter-argument considered: post-save editing may be redundant with FR-004's review step. Resolution: no counter-argument raised; kept as written.
- FR-008: User can delete a flashcard. Priority: must-have
  > Socrates: Counter-argument considered: reject (FR-004) already prevents most bad cards from being saved. Resolution: no counter-argument raised; kept as written.

### Study
- FR-009: User can study flashcards via a spaced-repetition session using an existing (non-custom) repetition algorithm. Priority: must-have
  > Socrates: Counter-argument considered: SR integration is the most technically expensive MVP piece; could defer to v2 with a plain review list first. Resolution: kept as must-have; SR is what distinguishes this product from a plain flashcard list per the original vision.

## Business Logic

Given a piece of source text, the application decides which facts or concepts within it are worth turning into a question-answer flashcard pair.

The rule consumes the pasted source text as input and produces a set of candidate flashcards (question-answer pairs) as output. The user encounters this rule immediately after they paste and submit their text — the generated candidates then feed into the accept/edit/reject review step (FR-004) before anything is saved.

## Non-Functional Requirements

- The user sees visible feedback within a couple of seconds of submitting text for generation, even if full generation takes longer.
- Source text a user pastes in is used only to generate that user's own flashcards and is not retained or used beyond that purpose.

## Non-Goals

- No custom repetition algorithm — the MVP integrates an existing, ready-made spaced-repetition algorithm rather than building one (e.g. SuperMemo/Anki-style). Building this ourselves is a large, separate engineering effort with no MVP payoff.
- No multi-format import (PDF, DOCX, etc.) — only copy-paste text input is supported.
- No sharing of flashcard sets between users — each user's flashcards are private to their own account.
- No integrations with other educational platforms (LMS, etc.).
- No mobile apps for now — web only, per the original scope.

## User Stories

### US-01: User generates and studies flashcards from pasted text

- **Given** a logged-in user with a piece of source text they want to retain
- **When** they paste the text and submit it for AI generation, then review and accept/edit/reject the resulting candidates
- **Then** the accepted flashcards are saved to their account and enter the spaced-repetition study queue, where they can start a study session

#### Acceptance Criteria
- Happy path only for now — edge cases (empty/short input, generation failure) are deferred to implementation planning.

## Quality cross-check

All elements present — no gaps.

- Access Control: present.
- Business Logic: present (one-sentence rule captured).
- Project artifacts: present.
- Timeline-cost ack: present (mvp_weeks: 3, within the 3-week guideline; no acknowledgment block required).
- Non-Goals: present (5 entries).
