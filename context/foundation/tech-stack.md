---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xcards
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

A solo learner shipping 10xCards — an AI flashcard generator with spaced-repetition
study — in a 3-week after-hours timeline needs a battle-tested, agent-friendly
starter that handles auth, a relational database, and AI-callable API routes
out of the box without much assembly. 10x Astro Starter (Astro + React +
TypeScript + Supabase + Cloudflare) is the recommended default for `(web-app, js)`
and clears all four agent-friendly gates — typed end-to-end via TypeScript,
convention-based routing/config, popular in JS training data, and well-documented.
Supabase covers auth (FR-001/FR-002) and Postgres storage for flashcards,
while Astro's API routes handle the AI-generation call (FR-003/FR-004). The
starter's edge-runtime gotcha (long-running tasks need a queue or external
worker) is a heads-up for the AI generation step but not a blocker at this
scope — no background-jobs flag was raised. Deployment defaults to Cloudflare
Pages per the starter's own default; CI runs on GitHub Actions with
auto-deploy-on-merge, the standard shape for a solo project.
