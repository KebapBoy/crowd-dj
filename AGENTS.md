# AGENTS.md

Instructions for AI coding agents (and humans) working on this repository: rules, architecture, layout and conventions. **How crowd-dj works and why is in [docs/concept.md](docs/concept.md)**: read it before building a feature. How to use and run it is in [README.md](README.md).

## Project

A web app (SvelteKit, TypeScript) for a shared music queue in a room: sessions that people join by link, pools and wishes per person, and a server-side engine that plays the next track in turns through one Spotify account. Only hosts (and their players) sign in with Spotify, since development mode allows 5 users per app; participants have profiles per browser.

## Architecture

- One process, one container: SvelteKit with adapter-node serves pages, form actions and JSON endpoints; SQLite through Drizzle and the libsql client holds everything that lasts; live updates, rate limits and the engine's view of each player live in memory.
- **Pages** load their data in `+page.server.ts` and change it through form actions; every session page holds a server-sent events connection and reloads its data on `change`.
- **Server modules** under `src/lib/server/` are created with their dependencies passed in (`createPicker({ db })`, …) and wired up once in `app.ts`, so tests build them with an in-memory database and a fake Spotify API.
- **The engine** (`engine.ts`) runs one loop per playing session: it polls the playing account, asks the picker (`picker.ts`) for the next track shortly before the current one ends and hands exactly that one track to Spotify's queue. crowd-dj's own queue is never mirrored into Spotify's.
- **Spotify** is reached only through `spotify/api.ts` (Web API) and `spotify/oauth.ts` (sign-in, tokens); `catalog.ts` caches what participants look up, `guards.ts` and `rate-limit.ts` limit what they can cause.

## Layout

| Path                                                        | Purpose                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routes/`                                               | Pages and endpoints (SvelteKit file routing); `healthz/` is the liveness check                                                                                                                                                                                                                                         |
| `src/routes/auth/`                                          | Spotify sign-in: `login`, `connect-player`, `callback`, `logout` (the two in the middle are page loads, so their errors use the translated error page)                                                                                                                                                                 |
| `src/routes/account/`                                       | "My account": player, token status, deleting the account                                                                                                                                                                                                                                                               |
| `src/routes/s/[id]/`                                        | A session; its id is the join link. JSON endpoints: `search/`, `tracks/`, `albums/`, `artists/` (catalog), `devices/` (the host's devices), `events/` (server-sent events)                                                                                                                                             |
| `src/routes/profile/`, `src/routes/p/[token]/`              | "My profile", and the personal link that uses a profile on another device too                                                                                                                                                                                                                                          |
| `src/lib/server/app.ts`                                     | Singletons from the environment, wiring of all server modules, cookies                                                                                                                                                                                                                                                 |
| `src/lib/server/accounts.ts`                                | Hosts and players, encrypted tokens, refresh, sign-ins                                                                                                                                                                                                                                                                 |
| `src/lib/server/profiles.ts`                                | Participants (the name length is in `src/lib/limits.ts`, shared with the form)                                                                                                                                                                                                                                         |
| `src/lib/server/sessions.ts`                                | Start, join, leave and join again, settings, playback state, end, idle end                                                                                                                                                                                                                                             |
| `src/lib/server/catalog.ts`                                 | Track cache, search, albums, lookups                                                                                                                                                                                                                                                                                   |
| `src/lib/server/pools.ts`, `src/lib/server/wishes.ts`       | Pools; wishes (limits checked in the inserting statement)                                                                                                                                                                                                                                                              |
| `src/lib/server/picker.ts`                                  | Whose turn, which track                                                                                                                                                                                                                                                                                                |
| `src/lib/server/engine.ts`                                  | The session engine: polls the player, queues the next track, pauses on foreign playback, devices                                                                                                                                                                                                                       |
| `src/lib/server/playing.ts`                                 | "Now playing" and "up next" for a page                                                                                                                                                                                                                                                                                 |
| `src/lib/server/events.ts`                                  | Live updates per session, in memory                                                                                                                                                                                                                                                                                    |
| `src/lib/server/guards.ts`, `src/lib/server/rate-limit.ts`  | Session access for pages and endpoints, Spotify errors, rate limits                                                                                                                                                                                                                                                    |
| `src/lib/server/errors.ts`, `crypto.ts`, `auth.ts`          | Log-safe error summaries; encryption, random tokens and hashes; the start of the sign-in flow (state cookie)                                                                                                                                                                                                           |
| `src/lib/server/spotify/`                                   | `api.ts` (Web API incl. player endpoints), `oauth.ts` (authorize URL, scopes, token exchange and refresh)                                                                                                                                                                                                              |
| `src/lib/server/db/`                                        | `open.ts` opens a database, `index.ts` is the app's, `schema.ts` holds the tables, `migrate.ts` applies `drizzle/` at start (`init` in `hooks.server.ts`)                                                                                                                                                              |
| `src/lib/components/`                                       | Own components (kebab-case files): e.g. `track-card.svelte` (cover and metadata for anything that plays), `now-playing.svelte`, `session-settings.svelte`, `catalog-search.svelte`, `status-badge.svelte` (one color per state)                                                                                        |
| `src/lib/components/ui/`                                    | shadcn-svelte components, generated by its CLI and committed; changed only where the app needs it                                                                                                                                                                                                                      |
| `src/lib/*.ts`                                              | Browser helpers: `actions.ts` (form actions outside a form with a toast), `spotify-links.ts` (parsing pasted links), `limits.ts` (shared with the server), `playing-messages.ts` (player problems), `utils.ts` (`cn()`)                                                                                                |
| `src/lib/paraglide/`                                        | Generated by Paraglide from `messages/` (ignored by git)                                                                                                                                                                                                                                                               |
| `messages/en.json`, `messages/de.json`, `project.inlang/`   | All visible texts and the Paraglide project                                                                                                                                                                                                                                                                            |
| `src/app.css`, `src/app.html`                               | Tailwind, the light and dark variables of shadcn-svelte and the custom variants its components need; `app.html` sets the `dark` class before the first paint                                                                                                                                                           |
| `src/env.ts`                                                | Environment variables, validated at start (`$app/env/private`)                                                                                                                                                                                                                                                         |
| `src/hooks.server.ts`                                       | `init` migrates the database; `handle` sets `locals.account` from the sign-in cookie and the locale (Paraglide)                                                                                                                                                                                                        |
| `components.json`                                           | shadcn-svelte settings (style nova, base color neutral, lucide icons, aliases through `#lib`)                                                                                                                                                                                                                          |
| `vite.config.ts`                                            | SvelteKit (adapter-node), Paraglide (locale from cookie, then browser), Vitest                                                                                                                                                                                                                                         |
| `drizzle.config.ts`, `drizzle/`                             | drizzle-kit and the migrations it generates                                                                                                                                                                                                                                                                            |
| `Dockerfile`, `.dockerignore`                               | Image on Node 26: stage `dev` for the devcontainer (with Claude Code and ssh-keygen), last stage the app (user `node`, port 3000, `/data`)                                                                                                                                                                             |
| `deploy/compose.yaml`                                       | Real installation behind a reverse proxy, settings from the stack's environment                                                                                                                                                                                                                                        |
| `.devcontainer/`                                            | `devcontainer.json` (features pinned in `devcontainer-lock.json`) and `serve.sh`, the dev server on port 5173; Claude Code with its settings in a volume and the host's `~/.claude/CLAUDE.md` mounted read-only (copied to the ignored `.devcontainer/host/` by `initializeCommand`); Docker inside (docker-in-docker) |
| `.env.example`                                              | All settings with comments                                                                                                                                                                                                                                                                                             |
| `.editorconfig`, `prettier.config.js`                       | Indentation, line endings and charset; `drizzle/` in drizzle-kit's own style                                                                                                                                                                                                                                           |
| `README.md`, `docs/concept.md`, `AGENTS.md`, `CHANGELOG.md` | See [Documentation](#documentation)                                                                                                                                                                                                                                                                                    |

Tests are `*.spec.ts` next to the code they test.

## Development

Open the repository in its devcontainer (VS Code: "Reopen in Container"). It installs the dependencies, creates `.env` from `.env.example` and starts the dev server at **http://127.0.0.1:5173** (log in `/tmp/serve.log`). Use the IP, not `localhost`: Spotify accepts plain http redirect URIs only for loopback IPs. For Spotify sign-in, add `http://127.0.0.1:5173/auth/callback` as a redirect URI to a Spotify app and fill in `.env`.

| Command               | Does                                                       |
| --------------------- | ---------------------------------------------------------- |
| `npm run check`       | Type check                                                 |
| `npm run lint`        | Prettier and ESLint                                        |
| `npm run format`      | Format everything                                          |
| `npm test`            | Unit tests (Vitest)                                        |
| `npm run build`       | Production build                                           |
| `npm run db:generate` | Migration from the schema (applied when the server starts) |

## Conventions

### Code

- Node 26, npm. The only runtime dependency is the native libsql client; everything else is a devDependency that adapter-node bundles. Dependencies are pinned exactly (`save-exact`), and only versions that have been out for at least 14 days are installed (`min-release-age` in `.npmrc`); the same for the base image in the `Dockerfile`.
- Formatting: Prettier (`prettier.config.js`) with 4 spaces, no semicolons, opening braces on the same line. Run `npm run format` before every commit (`npm run lint` checks it). `drizzle/` and `package-lock.json` are left to the tools that write them (npm takes the indentation of `package.json`).
- Svelte 5 runes everywhere. Server-only code lives under `src/lib/server/` or in `+page.server.ts` / `+server.ts`. Imports through `#lib/` name the file with its extension (`#lib/server/app.ts`).
- Code under `src/lib/server/` that tests import must not import `$app/env/private`: take the values as parameters, as `accounts.ts` does; `app.ts` wires them up.
- Schema changes: edit `schema.ts`, run `npm run db:generate`, commit the new migration in `drizzle/`. The server applies it at start. Never edit a migration that has been committed.
- Identifiers, comments and docs in English. **Every visible text goes through Paraglide** (`m.key()`) and gets both an English and a German message.

### UI

- Tailwind CSS 4 and shadcn-svelte (bits-ui), icons from `@lucide/svelte` imported one by one (`@lucide/svelte/icons/search`). Style only with Tailwind classes; the only own CSS is `src/app.css`.
- Nothing is loaded from outside at runtime, no web fonts: system fonts only.
- Mobile first: participants use phones, often in a dark room, so large touch targets (`h-11` on phones, smaller from `sm`) and nothing that only works on hover.
- Confirmations use AlertDialog (never `confirm()`), feedback on actions comes as a toast (svelte-sonner), loading states use Skeleton. Theme through mode-watcher (`<ModeWatcher disableHeadScriptInjection />`; the script in `app.html` sets the class first).
- Adding shadcn-svelte components: `npx svelte-kit sync`, then `npx shadcn-svelte@1.7.2 add --no-deps-install -y <name>…`, then `npm run format`; pin the `^` ranges the CLI writes to `package.json` exactly (keep `clsx` and `tailwind-merge`, do not add `cn`, `shadcn-svelte` or a font package) and run `npm install`. If a component needs a custom variant or keyframes not yet in `app.css`, copy them from `dist/tailwind.css` of the same CLI version.

### Spotify

- Respect the [platform limits](docs/concept.md#spotify-platform-limits): never re-stream audio, never call removed endpoints, look tracks up one at a time and cache them, poll only while a session plays.
- Show cover art and metadata with anything that plays (`track-card.svelte`).
- Calls that participants cause go through the rate limits; after a 429 respect `Retry-After`.
- Never use "Spotify" in the app's name.

### Settings and secrets

- Settings are environment variables, declared in `src/env.ts`. Add every new one with a comment to `.env.example`, to `deploy/compose.yaml` and to the configuration table in the README.
- Secrets (client secret, `APP_SECRET`, tokens) never go into the repository or the logs. Stored Spotify tokens are encrypted with `APP_SECRET`; cookies hold random tokens, the database only their hashes.
- This repository is public. Use `example.com`, `192.0.2.x` and generic names in code, docs, tests and commit messages. Never commit real domains, IP addresses, Spotify user IDs, tokens, `.env` or a database.

## Documentation

Each file has one reader:

| File              | For                      | Contains                                                                                                                                       |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`       | People who use or run it | What crowd-dj is and does, how it works (no technical detail), what it does not do, features that may come, requirements, setup, configuration |
| `docs/concept.md` | Developers               | How it works and why: Spotify limits, roles, pools, wishes and the picker, the engine, architecture, data model                                |
| `AGENTS.md`       | Agents and contributors  | Architecture overview, layout, development, conventions, checklist                                                                             |
| `CHANGELOG.md`    | People who run it        | Changes per release                                                                                                                            |

- **No open todos and no known bugs** in any file of the repository.
- **Future features** go only into the README's "Coming up" section: written to make new users curious, without promises or dates. Move a feature out of it (into the rest of the README and the concept) when it ships. The UI may tease them too, as long as everything in the UI is translated.
- Everywhere else, describe what the code does now: the concept and this file have no plans. The README's "What it does not do" says plainly what does not work, now or ever.
- When behavior changes, change the docs in the same commit: what users see in the README, how and why in the concept.

## Do's and don'ts

- **Do** read the concept and the code around a change before writing it; follow the patterns that are there (dependencies passed in, one statement where races matter, unique indexes for invariants).
- **Do** write tests for server logic (`*.spec.ts`), with an in-memory database and a fake Spotify API.
- **Do** keep pages working on a phone in the dark, with every text in both languages.
- **Don't** add runtime dependencies, external scripts, fonts or CDNs.
- **Don't** let participants sign in with Spotify, and don't reach Spotify outside `spotify/api.ts` and `spotify/oauth.ts`.
- **Don't** edit Spotify's queue beyond handing it the next track.
- **Don't** commit secrets, real addresses or a database; don't log tokens.

## With every change

1. Add the change to `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)) under `## [Unreleased]`. A release turns that section into `## [x.y.z] - YYYY-MM-DD` under [Semantic Versioning](https://semver.org/spec/v2.0.0.html), sets `version` in `package.json`, is committed as `chore: release x.y.z` and tagged `v<x.y.z>`. MAJOR for changes that need action from people running it (settings, Spotify app setup, data), MINOR for new features, PATCH for fixes.
2. Update `README.md` when features, requirements, installation or configuration change, `docs/concept.md` when how it works or a decision changes, and this file when the layout or the conventions change.
3. Check: `npm run check`, `npm run lint`, `npm test`, `npm run build`, and for changes to the image `docker build .` and a request to `/healthz`.
4. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `feat` (MINOR), `fix` (PATCH), `perf` (PATCH), `docs`, `refactor`, `test` or `chore` (no release); `!` after the type plus a `BREAKING CHANGE:` footer for MAJOR. Scopes where they help: `spotify`, `engine`, `session`, `pool`, `account`, `db`, `i18n`, `ui`, `docker`, `dev`. Imperative, lower-case subject up to 72 characters; the body says what changes for the user and why.
