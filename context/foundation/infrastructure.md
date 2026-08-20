---
project: 10xcards
researched_at: 2026-08-19
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd), via @astrojs/cloudflare
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already built on the `@astrojs/cloudflare` adapter — `astro.config.mjs` targets `output: "server"` with the Cloudflare adapter, and `wrangler.jsonc` already targets a Worker with static assets (not Cloudflare Pages), with the correct `@astrojs/cloudflare/entrypoints/server` entrypoint and `nodejs_compat` flag already set. Every other researched platform (Vercel, Netlify, Fly.io, Railway, Render) requires an adapter swap (`@astrojs/vercel`, `@astrojs/netlify`, or `@astrojs/node`) for zero functional gain — no persistent connections are required, traffic is single-region, and Supabase is already the external data layer. Cloudflare also scored highest on the five agent-friendly criteria (5/5 Pass, including a now-GA MCP Connector that was "work in progress" as of the prior research pass), fits comfortably inside its free tier at the target traffic volume (cost-sensitivity was this round's top interview priority), and matches confirmed hands-on developer familiarity.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass | Pass | Pass | 5P |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4P/1Pt |
| Netlify | Partial | Pass | Pass | Pass | Partial | 3P/2Pt |
| Render | Partial | Pass | Pass | Pass | Partial | 3P/2Pt |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 3P/2Pt |
| Railway | Pass | Partial | Pass | Partial | Partial | 2P/3Pt |

- **Cloudflare**: `wrangler deploy` / `wrangler rollback [VERSION_ID]` / `wrangler tail` are all scriptable and deterministic. `llms.txt`/`llms-full.txt` are GA, and pages support `Accept: text/markdown` content negotiation. The Cloudflare MCP Connector is now GA (OAuth-backed, "Code Mode" for token-efficient infra queries) — a real upgrade since the prior research pass labeled it "work in progress." Zero migration cost: the repo is already scaffolded for this exact target.
- **Vercel**: Equally strong CLI (`vercel --prod`, `vercel rollback`, `vercel logs`) and GA `llms-full.txt` docs. Requires an adapter swap (`@astrojs/vercel`) and its free Hobby tier is contractually restricted to non-commercial use — a real product like 10xCards would need the $20/mo Pro tier to stay ToS-compliant, working against this round's cost-minimization priority. Vercel MCP is beta (first mutating tool shipped July 2026, scoped to new projects only).
- **Netlify**: Requires an adapter swap (`@astrojs/netlify`) and a build-time env-var-access change (Astro 6 inlines `import.meta.env`; runtime secrets must go through `process.env`). Sync function timeout (10s free / 26s Pro) is a real constraint for the not-yet-built OpenRouter generation route. Rollback has no CLI subcommand (dashboard or `netlify api restoreSiteDeploy` only). Official MCP server is GA-track but Claude Code support is still "coming soon."
- **Render**: Requires an adapter swap (`@astrojs/node`). Free-tier cold starts (30-60s after 15 min idle, tightened from 30 min in Sept 2025) directly conflict with the PRD's "feedback within a couple seconds" NFR. Rollback also lacks a CLI subcommand. MCP server has no OAuth yet — bearer-API-key-only, which Render itself flags as a secret-exposure caution.
- **Fly.io**: Full container/VM model with no timeout constraints and genuine multi-region/WebSocket strength, but that strength is unneeded here (single-region, no persistent connections required). Requires `@astrojs/node` plus Dockerfile ownership (outside this skill's scope), and — updated from the prior research pass — Fly no longer has any standing free tier as of 2026 (trial credit only), landing at roughly $3-15/mo for one always-on machine. `fly mcp` subcommands are explicitly tagged `[experimental]` by Fly's own CLI docs; Fly's own blog states a philosophical preference for CLI-first agent workflows over MCP.
- **Railway**: Requires `@astrojs/node`. Railpack (Railway's build system, GA since March 2026, its second in-house builder in under three years) has open 2026 GitHub issues for env-var propagation (`cli#992`) and a secrets-field bug that silently strips other env vars (`railpack#455`). A May 2026 platform-wide outage (~6-8 hours) was caused by Railway's own GCP account being auto-suspended — a governance/dependency risk, not just a technical one.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the project's deployed runtime, with `wrangler.jsonc` already correctly targeting a Worker (not Pages). Highest-scoring platform on the five criteria (now 5/5 Pass — MCP moved from WIP to GA since the last check), GA agent-readable docs, fully scriptable CLI, comfortable free-tier fit at target traffic, and confirmed developer familiarity. Zero migration cost.

#### 2. Vercel

Matches Cloudflare on 4/5 criteria and would be the natural fallback if Cloudflare's Astro-adapter-specific risks (see Risk Register) ever became a blocker. Costs of switching: a real adapter swap, and the Hobby free tier's non-commercial-use ToS restriction effectively requires the $20/mo Pro tier for a real product — a direct hit against this round's cost-sensitivity priority.

#### 3. Netlify

Most mature official MCP integration story among the non-Cloudflare options (GA-track, only Claude Code support still pending) and GA docs/CLI, but the CLI-rollback gap and the sync-function-timeout risk for the future AI-generation route put it a notch below Cloudflare and Vercel for this project's needs. Chosen over Render and Fly.io because its main risk (function timeout) is deferred until the OpenRouter route ships and is mitigable (background functions), whereas Render's cold-start conflicts with an existing PRD NFR today, and Fly.io carries the highest guaranteed monthly floor with no free tier at all — the weakest fit against this round's explicit cost-minimization priority.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190) documents a "Fetch API cannot load: /" build error specifically when combining Astro 6 SSR + Supabase auth server endpoints on this adapter — closed **"not planned"** by maintainers, so no upstream fix is coming if this project hits it.
2. workerd's on-demand-rendered routes have no CommonJS (`require()`) support — any future npm dependency (e.g. an OpenRouter SDK) shipping CJS-only code could fail to bundle. The current codebase has no CJS dependencies, so this is untested territory that will only surface once the AI-generation feature adds new packages.
3. The free tier's 10ms CPU-time cap per invocation is tight for anything beyond pure routing — Supabase auth calls today, and OpenRouter response parsing once that route ships, risk silently tipping over the cap, surfacing as confusing partial failures rather than a clear "upgrade needed" signal.
4. Cloudflare is actively steering new SSR projects toward Workers and away from Pages — most existing tutorials and StackOverflow answers still assume a Pages deploy model, a real risk of picking up stale guidance mid-project even though this repo is already correctly configured for Workers.
5. Astro 6's Cloudflare adapter does not support Astro's environments feature — environment-specific settings are silently dropped, requiring a manual `CLOUDFLARE_ENV`-based workaround that's easy to skip until a staging/production config quietly diverges.

### Pre-Mortem — How This Could Fail

Six months after choosing Cloudflare Workers, 10xCards had accumulated a specific pattern of failures nobody predicted at decision time. The team assumed the existing Astro+Cloudflare scaffold meant "zero risk," so they skipped a dedicated staging smoke-test before shipping auth to production — and hit GitHub issue #16190's "Fetch API cannot load: /" error the first time a real user signed in through a server endpoint, with no upstream fix available since Astro maintainers had already closed it as "not planned." Debugging ate two evenings because the error only surfaced in the deployed Worker, not in local `wrangler dev`. Meanwhile, once the OpenRouter flashcard-generation route shipped, the team stayed on the free tier to save $5/month, and CPU-time throttling produced confusing partial failures that looked like OpenRouter timeouts rather than a Workers limit — nobody had budgeted the paid tier before launch as planned. By the time both issues were diagnosed, the team had also drifted onto deprecated "Cloudflare Pages" tutorials from search results, adding a third layer of confusion about which deploy target was actually authoritative.

### Unknown Unknowns

- [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190) is a closed-not-planned GitHub issue, not a documented limitation — it will not surface in official docs, only in a live deploy or a targeted GitHub search.
- workerd's CommonJS restriction is invisible until a specific future dependency fails to bundle — nothing in today's codebase reveals this constraint.
- Cloudflare's MCP tooling has moved from "work in progress" (per the prior research pass) to a **GA Claude Connector** using a token-saving "Code Mode" pattern — a genuine improvement most existing tutorials/blog posts predate and therefore undersell.
- KV-backed session/state storage (if ever reached for — e.g. rate-limiting or feature flags) is only eventually consistent with up to 60 seconds of cross-region propagation delay, surprising if not read carefully; not used by this app's Supabase-backed session model today.
- Cloudflare's default routing sends all non-static-asset requests through the Worker, including bot/vulnerability-probe traffic hitting random paths — silently consuming the free tier's request/CPU budget unless `run_worker_first` scoping is deliberately configured.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a version and returns an auto-generated preview URL (`<version-prefix>-<worker-name>.<subdomain>.workers.dev`) with no extra config needed as long as `workers_dev` is enabled — preview URLs are **public by default**, so add Cloudflare Access if that ever needs gating. Not in use yet for this project; revisit if per-branch preview deploys are wanted later.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, and (later) the OpenRouter API key live as Workers Secrets (`wrangler secret put <NAME>`), not in `wrangler.jsonc`. Locally, they're read from `.dev.vars` (gitignored). Cloudflare Secrets Store exists but is still beta and account-scoped/cross-Worker — unnecessary for this single-Worker MVP.
- **Rollback**: `wrangler rollback [VERSION_ID]` (defaults to the previous version if omitted) reverts the Worker in seconds; `wrangler deployments list` finds a specific target. Rollback reverts code/config only — it does **not** restore secret values to what they were at that version's original deploy time, and Supabase schema migrations do not roll back automatically either.
- **Approval**: Routine deploys (`wrangler deploy`) and rollbacks may run unattended by an agent. Human-only: rotating the Supabase service-role key or OpenRouter key, changing billing/plan tier, and deleting the Worker/project.
- **Logs**: `wrangler tail` streams live runtime logs from the terminal. Cloudflare's MCP Connector (`developers.cloudflare.com` agent tooling, OAuth-backed, GA as of this research pass) now supports structured queries too — an upgrade from the prior "work in progress" status — but `wrangler tail` remains the simplest, zero-setup path for now.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190): "Fetch API cannot load: /" build error when combining Astro 6 SSR + Supabase auth endpoints on this adapter, closed not-planned | Devil's advocate | M | H | Smoke-test the full auth flow (sign up, sign in, protected route, sign out) against a real deployed Worker before relying on it in production, not just `wrangler dev` |
| `astro:env` may not forward `wrangler secret put` runtime secrets correctly in the workerd runtime (distinct from the build-time `vars` forwarding bug already fixed upstream) | Research finding | M | H | Verify `SUPABASE_URL`/`SUPABASE_KEY` actually populate in a live deploy; if not, import `env` from `cloudflare:workers` directly in `src/lib/supabase.ts` instead of `astro:env/server` |
| workerd's lack of CommonJS support breaks a future npm dependency (e.g. an OpenRouter SDK) once the AI-generation route is built | Devil's advocate | M | M | Check any new dependency for ESM/ESM-compatible builds before adding it; pre-bundle or swap packages if a CJS-only dependency is unavoidable |
| Free-tier 10ms CPU cap throttles the AI-generation route under real load, surfacing as confusing OpenRouter-timeout-like errors | Pre-mortem | M | M | Budget for the $5/mo paid plan before that route ships, not after; the paid tier's default 30s (configurable to 5 min) CPU limit comfortably covers response parsing |
| Astro 6's Cloudflare adapter doesn't support Astro's environments feature, silently dropping environment-specific settings | Devil's advocate | L | M | Use `CLOUDFLARE_ENV` explicitly for any per-environment config; document the workaround so it isn't rediscovered under pressure |
| Stale "Cloudflare Pages" guidance in tutorials/search results causes confusion about the actual deploy target | Devil's advocate | L | L | This repo's `wrangler.jsonc` already correctly targets a Worker with static assets — keep it that way; don't follow Pages-specific docs |
| KV eventual consistency (up to 60s cross-region) surprises if reached for without reading the fine print | Unknown unknowns | L | L | Avoid KV for anything needing strong consistency; not used by the current Supabase-backed session model |
| Default Worker routing consumes free-tier request/CPU budget on bot/probe traffic hitting non-asset paths | Unknown unknowns | L | L | Configure `run_worker_first` scoping if free-tier usage ever becomes tight |

## Getting Started

1. This repo's `wrangler.jsonc` already targets a Worker with static assets (not Pages) — no config change needed; confirm it stays that way.
2. `npx wrangler login` (human step — interactive OAuth, not yet authenticated in this environment).
3. Set secrets before first deploy: `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_KEY` — do not commit these to `wrangler.jsonc`.
4. `npm run build` (runs `astro build`) then `npx wrangler deploy`.
5. Smoke-test the full auth flow against the live URL, specifically watching for the "Fetch API cannot load: /" error from [astro/cloudflare#16190](https://github.com/withastro/astro/issues/16190) — if it appears, there is no upstream fix, so plan a workaround before relying on this deploy.
6. Budget for the $5/mo Workers Paid plan before the OpenRouter flashcard-generation route ships — the free tier's 10ms CPU cap is a real constraint for that route, not a hypothetical one.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
