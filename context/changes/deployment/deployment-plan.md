---
project: 10xcards
based_on: context/foundation/infrastructure.md
platform: Cloudflare Workers (not Pages)
status: draft
last_updated: 2026-08-19
---

# Cloudflare Workers Deployment Plan

Legend: `[ ]` not started · `[~]` in progress · `[x]` done · 🔒 human-only gate (per infra.md's production-access boundary)

## Phase 0 — Prerequisites & account setup 🔒

### 0.1 — Configure the Wrangler CLI (Cloudflare)

- [ ] No global install needed — `wrangler` is already a devDependency (`^4.90.0` in `package.json`), so every command below runs via `npx wrangler ...` from the repo root.
- [ ] 🔒 Confirm/create the Cloudflare account that will own this Worker (sign up at `dash.cloudflare.com` if none exists — free, no card required for the account itself).
- [ ] 🔒 `npx wrangler login` — opens a browser for interactive OAuth. Must run in a real browser session, not headless/CI. **Verified: this repo is currently not authenticated** (`npx wrangler whoami` → "You are not authenticated").
- [ ] Verify it worked: `npx wrangler whoami` should print the logged-in account email and any Account IDs available to it.
- [ ] **Edge case — multiple Cloudflare accounts on one login.** If `whoami` lists more than one Account ID (e.g. a personal account plus an org), `wrangler deploy` will prompt to pick one interactively the first time — inconvenient for an agent-run deploy. Pin it explicitly instead: add `"account_id": "<the-right-id>"` to `wrangler.jsonc`, or export `CLOUDFLARE_ACCOUNT_ID=<id>` in the shell before running `wrangler` commands non-interactively.
- [ ] 🔒 Optional, skip for now if deploys stay human-run from a local terminal: create a scoped API token (Workers Scripts: Edit, this one project only — no DNS, no billing, no other zones) for any future CI/agent use, per infra.md's "tokens are scoped, not master keys" posture. Store it as `CLOUDFLARE_API_TOKEN` in the environment running `wrangler` — never in a committed file.
- [ ] **Edge case — no git repo.** This working directory has no `.git` (`git status` fails with "not a git repository"). The existing `.github/workflows/ci.yml` assumes push/PR to `master` on GitHub, but nothing is actually version-controlled or pushed yet. Before CI can run: `git init`, create the GitHub repo, push, then add `SUPABASE_URL`/`SUPABASE_KEY` as repo secrets (Settings → Secrets and variables → Actions). Independent of the Cloudflare deploy path itself (deploys can happen from a local terminal without any of this) — flagging it only because CI currently can't run at all.

### 0.2 — Configure Supabase

- [ ] No global install needed here either — `supabase` CLI is already a devDependency (`^2.23.4`), run via `npx supabase ...`.
- [ ] 🔒 Create/confirm the hosted Supabase project that production will point at: sign in at `supabase.com/dashboard` → New Project. Pick a region close to where users actually are (single-region is fine per the infra decision) and record the DB password somewhere safe — not needed for this app's current auth-only usage, but Supabase requires setting one at project creation and it's needed later for any direct Postgres access.
- [ ] Get the two values `src/lib/supabase.ts` actually needs: Project Settings → API → **Project URL** and **anon public key**. These become `SUPABASE_URL` / `SUPABASE_KEY` — the same names already declared in `astro.config.mjs`'s `env.schema` and used as placeholders in `.env.example`.
- [ ] Put them in `.dev.vars` (gitignored, already present with placeholder values) for local `wrangler dev` — this file already exists at the repo root, just fill in the real values.
- [ ] **Decide local-dev strategy before filling in `.dev.vars`** — two real options:
  - **(a) Point local dev straight at the hosted project.** Simplest — paste the real Project URL/anon key into `.dev.vars`. Tradeoff: local development then exercises production auth data (real signups land in the real `auth.users` table). Fine for a solo MVP, but worth knowing.
  - **(b) Run Supabase locally instead.** `npx supabase start` (requires Docker Desktop or equivalent running, ~7GB RAM per this project's CLAUDE.md) spins up a local Postgres + Auth stack; Studio at `http://localhost:54323`. Point `.dev.vars` at the local API URL/anon key it prints instead (defaults: URL `http://127.0.0.1:54321`, anon key printed by `supabase start`/`supabase status`). No migrations exist yet, so the local stack only needs Auth's built-in `auth.users` table — nothing to seed.
  - Recommendation: use (b) once flashcard tables and migrations start landing (soon, per the PRD), so schema changes get tested locally before touching production; (a) is acceptable for now since only auth exists.
- [ ] 🔒 Set the Auth **Site URL** and **Redirect URLs** (Authentication → URL Configuration in the Supabase dashboard) to the real deployed Worker URL once Phase 3 gives you one (e.g. `https://<worker-name>.<subdomain>.workers.dev`). **Edge case**: until this is set, Supabase's default is `localhost` — the confirm-email link sent during the Phase 3 sign-up smoke test will redirect to `localhost` instead of the live site, making that step look broken even though auth itself worked. Do this *before* running the Phase 3 smoke test, not after.
- [ ] **Edge case — email confirmation delivery.** Supabase's built-in email sender is rate-limited and meant for testing only, not production volume — fine for the Phase 3 smoke test and early MVP traffic, but if confirmation emails silently don't arrive, check Authentication → Logs in the dashboard before assuming the app code is broken. Configuring a custom SMTP provider is a later, separate task (out of scope here).
- [ ] Only needed once schema migrations start (not required for today's auth-only scope, listed here so it isn't rediscovered later under pressure): `npx supabase login`, then `npx supabase link --project-ref <ref>` (the ref is the short ID in the project's dashboard URL) to connect this CLI to the hosted project for `supabase db push`/migration workflows.

## Phase 1 — Pre-deploy configuration check

Repo state already confirmed good — no changes needed for these:
- [x] `wrangler.jsonc` already targets a **Worker with static assets**, not Pages (`assets.binding`, `assets.directory: ./dist`) — matches infra.md's recommendation to avoid the Pages→Workers migration risk.
- [x] `main` entrypoint is `@astrojs/cloudflare/entrypoints/server`, the correct path for `@astrojs/cloudflare` v13 (Astro 6 dropped `Astro.locals.runtime`; verified this is the current, non-deprecated entrypoint for the pinned `^13.5.0`).
- [x] `compatibility_flags: ["nodejs_compat"]` already set — required for `@supabase/ssr`'s use of Node built-ins under workerd.
- [x] `observability.enabled: true` already set.

Action items:
- [ ] **Verify the `astro:env` secret-forwarding risk directly** (infra.md's top risk). Research update: [astro#16790](https://github.com/withastro/astro/issues/16790) (the "vars not forwarded" bug) was fixed in [PR #17275](https://github.com/withastro/astro/pull/17275) (merged 2026-07-07) for our exact astro/`@astrojs/cloudflare` version line — **but that fix covers build-time `vars`, not `wrangler secret put` runtime secrets**, which is what `SUPABASE_URL`/`SUPABASE_KEY` actually use (`access: "secret"` in `astro.config.mjs`). Treat as unverified until tested live (Phase 3).
  - Fallback ready if it fails in Phase 3: swap `src/lib/supabase.ts`'s `import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server"` for `import { env } from "cloudflare:workers"` and read `env.SUPABASE_URL` / `env.SUPABASE_KEY` — Astro's own docs now list this as the primary pattern for Workers, with `astro:env/server` only "also compatible."
- [ ] **New — verify the Astro 6 + Supabase auth Cloudflare-adapter build error is not present**: [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190) documents a "Fetch API cannot load: /" error specifically when combining Astro 6 SSR + Supabase auth server endpoints on this adapter, closed **not-planned** by maintainers. No upstream fix exists — smoke-test the auth flow in a real deploy (Phase 3) since it won't reproduce in local `wrangler dev`.
- [ ] Decide the CPU-limit posture up front: free tier caps at **10ms CPU/request** (fetch/network wait doesn't count, only actual compute like JSON parsing does); paid plan ($5/mo) defaults to 30s and is configurable up to 5 min via `limits.cpu_ms`. Auth-only routes today are cheap enough for free tier — revisit before the OpenRouter flashcard-generation route ships (see Phase 6).
- [ ] **New — watch for CommonJS-only dependencies**: workerd's on-demand routes have no `require()` support. No current dependency trips this, but check any new package (e.g. an OpenRouter SDK) for ESM compatibility before adding it.

## Phase 2 — Secrets 🔒

- [ ] 🔒 `npx wrangler secret put SUPABASE_URL`
- [ ] 🔒 `npx wrangler secret put SUPABASE_KEY`
- [ ] 🔒 (Later, when the AI-generation feature lands) `npx wrangler secret put OPENROUTER_API_KEY`
- [ ] Confirm `.dev.vars` (already gitignored) stays the local-only equivalent — never commit it, never put secrets in `wrangler.jsonc`.
- [ ] Note for the record: Cloudflare Secrets Store exists but is still beta and account-scoped/cross-Worker — confirmed unnecessary for this single-Worker MVP; `wrangler secret put` remains the current, non-deprecated mechanism.

## Phase 3 — First deploy & live verification

- [ ] `npm run build` (runs `astro build`, produces `./dist`)
- [ ] `npx wrangler deploy`
- [ ] **Verify env/secrets actually populate in the live Worker** (not just `wrangler dev`) — hit a page that exercises `createClient()` in `src/lib/supabase.ts` and confirm it doesn't silently fall back to the `null`-client path (which happens whenever `SUPABASE_URL`/`SUPABASE_KEY` are falsy). If it does fall back, apply the `cloudflare:workers` fallback from Phase 1 and redeploy.
- [ ] Smoke-test the full auth flow against the live URL: sign up → confirm email → sign in → visit `/dashboard` (protected route) → sign out → confirm redirect back to `/auth/signin`. Watch specifically for the [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190) "Fetch API cannot load: /" error during this step.
- [ ] **Edge case — Node-compat gap**: [supabase/supabase#37592](https://github.com/supabase/supabase/issues/37592) reports `@supabase/ssr` throwing `dynamic require of "stream" is not supported` on workerd in some configs. `nodejs_compat` is already set, which should cover it, but confirm no such error appears in `wrangler tail` output during the sign-in smoke test.
- [ ] **Edge case — cookie size**: [supabase/ssr#56](https://github.com/supabase/ssr/issues/56) documents `@supabase/ssr` occasionally writing 4 cookies instead of 2–3 during some auth flows, pushing the combined cookie header close to browser per-cookie limits (~4KB) even though Cloudflare's own header cap is 32KB. Low risk for plain email/password (our current flow) but check the `Set-Cookie` headers in browser devtools during sign-in once live, and re-check specifically if OAuth providers are added later.

## Phase 4 — Rollback & operational readiness

- [ ] Confirm `npx wrangler deployments list` shows the deploy and `npx wrangler rollback [VERSION_ID]` works against a throwaway bad deploy (test this once now, while it's cheap to break things, rather than discovering it during a real incident).
- [ ] **Edge case — rollback does not restore secrets.** A rollback reverts code/config to a prior version but runs against whatever secrets are *currently* set — it will not undo a secret rotation. Keep that mental model: "rollback fixes bad code, not bad secrets."
- [ ] `npx wrangler tail` confirmed as the primary live-log path; Cloudflare's MCP Connector is now GA for structured queries (an upgrade from earlier "work in progress" status) but `wrangler tail` remains the simplest zero-setup path for now.
- [ ] Skip Cloudflare Access / preview-URL gating for now (no `wrangler versions upload` preview flow is in use yet) — revisit if/when preview-per-branch deploys are added; note preview URLs are public by default once enabled.

## Phase 5 — CI (explicitly scoped down)

Per infra.md, CI/CD pipeline setup was out of scope for the infra research, and this plan keeps it that way:
- [ ] Leave `.github/workflows/ci.yml` as lint+build validation only — **do not** wire an auto-deploy step into CI as part of this plan.
- [ ] Once Phase 0's git/GitHub setup is done, confirm CI goes green with the repo secrets in place.
- [ ] (Optional, separate future decision) If auto-deploy-on-merge is wanted later, that's a new scoped task — needs its own scoped API token in GitHub Actions secrets, not the local `wrangler login` session.

## Phase 6 — Before public launch (revisit, don't do now)

- [ ] Upgrade to the $5/mo Workers Paid plan **before** the OpenRouter flashcard-generation route ships — free tier's 10ms CPU cap will throttle response parsing under real load once that route exists (it doesn't exist yet, per current `src/pages/` contents — only auth is built).
- [ ] Re-run the auth cookie-size check (Phase 3) if any OAuth provider is added, since that's the specific condition the supabase/ssr#56 issue applies to.
- [ ] Reconfirm D1/KV/R2 stay out of scope — Supabase remains the sole data layer (infra.md's explicit scope-creep risk).

## Human-only actions (never automate)

Per infra.md's operational story — rotating the Supabase service-role key or OpenRouter key, changing billing/plan tier, and deleting the Worker/project are 🔒 human-only regardless of how routine `wrangler deploy`/`wrangler rollback` become.
