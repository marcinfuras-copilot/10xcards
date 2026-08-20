---
bootstrapped_at: 2026-08-17T18:45:07Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xcards
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
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
```

### Why this stack

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

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                                      |
| ------------------- | --------------------------------------------------- | -------- | ----------------------------------------------------------- |
| npm package         | not run                                              | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to check |
| GitHub repo         | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card `docs_url`, via public GitHub API (`gh` CLI unavailable in this environment) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 top-level entries (astro.config.mjs, components.json, .env.example, eslint.config.js, .github, .gitignore, .husky, node_modules, .nvmrc, package.json, package-lock.json, .prettierrc.json, public, README.md, src, supabase, tsconfig.json, .vscode, wrangler.jsonc)
**Conflicts (.scaffold siblings)**: CLAUDE.md → CLAUDE.md.scaffold (existing CLAUDE.md preserved)
**.gitignore handling**: moved silently (cwd had no pre-existing .gitignore)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up; temp dir removed after move-up)

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 (npm audit `isDirect` per advisory)

#### CRITICAL findings

- **tar** (transitive, via `supabase`) — range `<=7.5.20` — node-tar PAX size-override header smuggling, PAX numeric path type confusion process crash, and unlimited-input decompression DoS. Fix available (upgrade `tar`).

#### HIGH findings

- **astro** (direct) — range `<=7.0.9` — XSS via unescaped attribute names in spread props / `renderHTMLElement` (incomplete fix for CVE-2026-54298); XSS via unescaped `transition:*` directive values on hydrated islands. Fix available.
- **brace-expansion** (transitive) — range `<=1.1.17 || 3.0.0 - 5.0.8` — DoS via exponential-time expansion of consecutive non-expanding `{}` groups; unbounded expansion length OOM crash. Fix available.
- **devalue** (transitive) — range `5.6.3 - 5.8.0` — DoS via sparse array deserialization. Fix available.
- **fast-uri** (transitive) — range `3.0.0 - 3.1.4` — host confusion via literal/backslash authority delimiter; failed IDN canonicalization. Fix available.
- **js-yaml** (transitive) — range `4.0.0 - 4.3.0` — quadratic-complexity DoS in merge-key handling / `!!omap` resolution (CVE-2026-59870 fix not backported). Fix available.
- **miniflare** (transitive, via `sharp`/`undici`/`ws`) — range `<=0.0.0-fff677e35 || 3.20250204.0 - 5.20260801.0-alpha`. Fix available.
- **nanoid** (transitive) — range `<=3.3.17` — non-secure/custom generators can loop indefinitely with negative or zero size. Fix available.
- **postcss** (transitive) — range `<=8.5.22` — path traversal via `sourceMappingURL` auto-loading leads to arbitrary `.map` file disclosure (incomplete fix of GHSA-6g55-p6wh-862q). Fix available.
- **sharp** (transitive) — range `<0.35.0` — inherited libvips CVEs (CVE-2026-33327, -33328, -35590, -35591). Fix available.
- **svgo** (transitive) — range `4.0.0 - 4.0.1` — `removeScripts` plugin leaves some executable scripts intact. Fix available.
- **undici** (transitive) — range `7.0.0 - 7.28.0` — TLS cert validation bypass via dropped `requestTls` in SOCKS5 ProxyAgent; HTTP header injection via `Set-Cookie` percent-decoding; WebSocket DoS via fragment count bypass. Fix available.
- **vite** (transitive) — range `7.0.0 - 7.3.3` — `launch-editor` NTLMv2 hash disclosure via UNC path handling on Windows; `server.fs.deny` bypass on Windows alternate paths. Fix available.
- **ws** (transitive) — range `8.0.0 - 8.20.1` — uninitialized memory disclosure; memory exhaustion DoS from tiny fragments/data chunks. Fix available.

#### MODERATE findings

- **@astrojs/language-server** (transitive, via `volar-service-yaml`) — range `2.14.0 - 2.16.10`. Fix available.
- **@cloudflare/vite-plugin** (transitive, via `miniflare`/`wrangler`/`ws`) — range `<=0.0.0-fff677e35 || 0.0.7 - 1.41.0`. Fix available.
- **supabase** (direct, via `tar`) — range `1.1.6 - 2.98.2`. Fix available.
- **volar-service-yaml** (transitive, via `yaml-language-server`) — range `<=0.0.70`. Fix available.
- **wrangler** (direct, via `esbuild`/`miniflare`) — range `<=0.0.0-kickoff-demo || 3.108.0 - 4.101.0`. Fix available.
- **yaml** (transitive) — range `2.0.0 - 2.8.2` — stack overflow via deeply nested YAML collections. Fix available.
- **yaml-language-server** (transitive, via `yaml`) — range `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`. Fix available.

#### LOW / INFO findings

- **@babel/core** (transitive) — range `<=7.29.0` — arbitrary file read via `sourceMappingURL` comment. Fix available.
- **esbuild** (transitive) — range `0.27.3 - 0.28.0` — arbitrary file read when running the dev server on Windows. Fix available.

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ----------------------------------- |
| bootstrapper_confidence    | first-class                         |
| quality_override           | false                                |
| path_taken                 | standard                             |
| self_check_answers         | null                                 |
| team_size                  | solo                                 |
| deployment_target          | cloudflare-pages                     |
| ci_provider                | github-actions                       |
| ci_default_flow            | auto-deploy-on-merge                 |
| has_auth                   | true                                 |
| has_payments               | false                                |
| has_realtime                | false                                |
| has_ai                     | true                                 |
| has_background_jobs        | false                                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` and decide which content to keep/merge.
- Address audit findings per your project's risk tolerance — all fixes are reported as available (`npm audit fix` covers most; `astro` and `supabase` are the direct-dependency findings worth prioritizing first). Full breakdown is above.
