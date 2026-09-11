# 10xCards

An AI flashcard generator with spaced-repetition study. Paste in a piece of source text (documentation, an article, course notes), get AI-generated flashcard candidates back, review each one — accept, edit, or reject — and study the accepted cards through a spaced-repetition algorithm ([FSRS](https://github.com/open-spaced-repetition/ts-fsrs)).

The bet: writing good flashcards by hand is tedious enough that most people never start. Removing that friction with AI generation is what gets learners to actually adopt spaced repetition and keep coming back — see [`context/foundation/prd.md`](./context/foundation/prd.md) for the full product spec.

## Features

- **AI generation** — paste text, get flashcard candidates (question/answer pairs) generated via an LLM.
- **Review workflow** — accept, edit, or reject each AI candidate before anything is saved.
- **Manual creation** — add flashcards by hand.
- **Flashcard management** — browse, edit, and delete your saved flashcards.
- **Spaced-repetition study** — review due cards in a study session; each rating (again/hard/good/easy) reschedules the card via FSRS.
- **Per-user accounts** — email/password auth via Supabase, with flashcards scoped to their owner at the database level (Postgres RLS).

## Tech Stack

- [Astro](https://astro.build/) v6 — server-rendered app shell (`output: "server"`)
- [React](https://react.dev/) v19 — interactive islands (forms, review/study sessions)
- [TypeScript](https://www.typescriptlang.org/) v5
- [Tailwind CSS](https://tailwindcss.com/) v4 + [shadcn/ui](https://ui.shadcn.com/) ("new-york" style)
- [Supabase](https://supabase.com/) — Postgres, Auth, and row-level security
- [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) — spaced-repetition scheduling algorithm
- [OpenRouter](https://openrouter.ai/) — LLM access for flashcard generation
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge deployment runtime

See [`context/foundation/tech-stack.md`](./context/foundation/tech-stack.md) for the reasoning behind these choices.

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)
- [Docker](https://www.docker.com/) (for local Supabase, ~7 GB RAM)
- An [OpenRouter](https://openrouter.ai/) API key (for AI generation)

## Getting Started

1. Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd 10xCards
npm install
```

2. Set up Supabase (local or cloud) and an OpenRouter API key — see [Environment Configuration](#environment-configuration) below.

3. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

4. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier

## Project Structure

```md
.
├── src/
│ ├── layouts/            # Astro layouts
│ ├── pages/
│ │ ├── auth/              # Sign in / sign up / confirm-email pages
│ │ ├── flashcards/        # Generate, manual create, list/manage pages
│ │ ├── study.astro        # Study session page
│ │ └── api/
│ │   ├── auth/            # signin, signup, signout
│ │   ├── flashcards/      # list/save, manual create, get/update/delete by id
│ │   └── study/           # due cards, submit a review
│ ├── components/
│ │ ├── auth/              # Sign in/up forms
│ │ ├── flashcards/        # Generation, review, list, edit/delete dialogs
│ │ ├── study/             # StudySession
│ │ └── ui/                # shadcn/ui primitives
│ └── lib/
│   ├── services/
│   │ ├── openrouter.ts    # AI flashcard-candidate generation
│   │ └── scheduler.ts     # FSRS grading/scheduling
│   └── supabase.ts        # Supabase SSR client
├── supabase/migrations/   # flashcards table schema + RLS policies
├── context/foundation/    # PRD, tech stack, roadmap
├── public/                # Public assets
├── wrangler.jsonc         # Cloudflare Workers config
```

## Environment Configuration

Environment variables are declared via Astro's `astro:env` schema (`astro.config.mjs`) and are **server-only secrets** — never exposed to the client.

| Variable             | Description                                    |
| --------------------- | ----------------------------------------------- |
| `SUPABASE_URL`        | Supabase project URL                             |
| `SUPABASE_KEY`        | Supabase `anon` public key                       |
| `OPENROUTER_API_KEY`  | OpenRouter API key, used for AI flashcard generation |

All three are optional at the schema level (the app runs with a "not configured" banner and generation disabled if `OPENROUTER_API_KEY` is missing), but sign-in/sign-up and AI generation won't work without them.

### First-time Supabase setup (local)

Requires Docker and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

3. Apply migrations to create the `flashcards` table and its RLS policies:

```bash
npx supabase db reset
```

4. Copy the credentials printed by the CLI, plus your OpenRouter key, into `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
OPENROUTER_API_KEY=<your OpenRouter key>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Using a cloud Supabase project instead

Add the same variables to `.env` and `.dev.vars`, pointing at your hosted project (Supabase dashboard → Settings → API):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
OPENROUTER_API_KEY=<your OpenRouter key>
```

Run `npx supabase link` and `npx supabase db push` to apply the migrations in `supabase/migrations/` to the cloud project.

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Routes

| Route                 | Description                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `/auth/signin`         | Email/password sign-in form                                              |
| `/auth/signup`         | Email/password sign-up form                                              |
| `/auth/confirm-email`  | Post-signup "check your inbox" page                                      |
| `/dashboard`           | Landing page after sign-in                                                |
| `/flashcards/new`      | Paste text and generate AI flashcard candidates                          |
| `/flashcards/manual`   | Manually create a flashcard                                              |
| `/flashcards`          | Browse, edit, and delete your flashcards                                 |
| `/study`               | Study due flashcards in a spaced-repetition session                      |

All routes above except the `/auth/*` pages require authentication (see `PROTECTED_ROUTES` in `src/middleware.ts`); unauthenticated visitors are redirected to `/auth/signin`.

## Data & Access Control

Flashcards live in a single `flashcards` table (`supabase/migrations/`), owned by `user_id` and protected by Postgres row-level security: every `select`/`insert`/`update`/`delete` policy requires `auth.uid() = user_id`, so a user can only ever see or modify their own flashcards — enforced at the database layer, not just in application code.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs `astro sync`, lint, and build on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## Project Foundation

- [`context/foundation/prd.md`](./context/foundation/prd.md) — full product spec (user stories, functional/non-functional requirements, non-goals, access control)
- [`context/foundation/tech-stack.md`](./context/foundation/tech-stack.md) — why this stack was chosen
- [`context/foundation/roadmap.md`](./context/foundation/roadmap.md) — milestone-driven build roadmap

## License

MIT
