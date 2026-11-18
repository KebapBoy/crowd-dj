# crowd-dj

A shared music queue for a room full of people. Someone starts a session, everyone joins with a link or QR code and adds music, and crowd-dj plays it **in turns** through one Spotify account on the room's speaker. Participants do not need a Spotify account.

> **Status:** early development. This is the project skeleton; nothing works yet beyond a start page. What it will do and why is in [docs/concept.md](docs/concept.md).

## Features (planned)

- Sessions with join link and QR code; participants keep a profile per browser, no sign-in.
- Everyone keeps a pool of tracks, filled in the Spotify app (a collaborative inbox playlist) or in crowd-dj (search, pasted track links).
- Three modes for the next track: wishes before pools, pools only, or wishes only, always in turns per person.
- Host settings: anonymous sessions, limits per person, skip voting.
- A fixed room account that anyone can start a session on, plus personal hosts.
- English and German.

## Requirements

- A Spotify app in development mode from the [developer dashboard](https://developer.spotify.com/dashboard), owned by a Premium account. Development mode allows at most 5 Spotify users per app, and only hosts sign in with Spotify. See [docs/concept.md](docs/concept.md#spotify-platform-limits-why-it-is-built-this-way).
- Every account that plays (room account, personal hosts) needs Spotify Premium.
- Docker, and a reverse proxy with HTTPS.

## Running

1. Create a Spotify app. Under redirect URIs add `https://dj.example.com/auth/callback` (your `ORIGIN` plus `/auth/callback`). Add the admin and the room account to the allowlist (User Management).
2. Use [deploy/compose.yaml](deploy/compose.yaml), for example as a git stack with that compose path, and set the variables in the environment of the stack. Every variable is explained in [.env.example](.env.example).
3. Point your reverse proxy at the container on port 3000.

The database lives in the volume `data` (`/data/crowd-dj.db`). `GET /healthz` answers `ok`.

## Configuration

| Variable                | Purpose                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `ORIGIN`                | Public URL without a trailing slash; the Spotify redirect URI is `<ORIGIN>/auth/callback` |
| `DATABASE_URL`          | SQLite database file as a libsql URL (the image sets `file:/data/crowd-dj.db`)            |
| `SPOTIFY_CLIENT_ID`     | Client ID of the Spotify app                                                              |
| `SPOTIFY_CLIENT_SECRET` | Client secret of the Spotify app (secret)                                                 |
| `ADMIN_SPOTIFY_USER_ID` | Spotify user ID of the admin                                                              |
| `APP_SECRET`            | Key for encrypting stored tokens and signing cookies (secret; `openssl rand -base64 32`)  |
| `TZ`                    | Time zone                                                                                 |

## Development

Open the repository in its devcontainer (VS Code: "Reopen in Container"). It installs the dependencies, creates `.env` from `.env.example`, and starts the dev server at **http://127.0.0.1:5173** (use the IP, not `localhost`: Spotify accepts plain http redirect URIs only for loopback IPs). For Spotify sign-in, add `http://127.0.0.1:5173/auth/callback` as a second redirect URI to your Spotify app and fill in `.env`.

| Command               | Does                      |
| --------------------- | ------------------------- |
| `npm run check`       | Type check                |
| `npm run lint`        | Prettier and ESLint       |
| `npm run format`      | Format everything         |
| `npm test`            | Unit tests (Vitest)       |
| `npm run build`       | Production build          |
| `npm run db:generate` | Migration from the schema |

## License

[MIT](LICENSE)
