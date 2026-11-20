# crowd-dj

A shared music queue for a room full of people. Someone starts a session, everyone joins with a link or QR code and adds music, and crowd-dj plays it **in turns** through one Spotify account on the room's speaker. Participants do not need a Spotify account.

> **Status:** early development. Working so far: Spotify sign-in for hosts and the "My account" page (optional player account, token expiry), participant profiles, and sessions with join link, QR code and settings. Nothing plays yet: music (pools, wishes, search) and the engine that plays it come next. What it will do and why is in [docs/concept.md](docs/concept.md).

## Features (planned)

- Sessions with join link and QR code; participants keep a profile per browser, no sign-in.
- Everyone keeps a pool of tracks, filled in the Spotify app (a collaborative inbox playlist) or in crowd-dj (search, pasted track links).
- Three modes for the next track: wishes before pools, pools only, or wishes only, always in turns per person.
- Host settings: anonymous sessions, limits per person, skip voting.
- Hosts sign in with Spotify; their sessions play through their own account or an optional second "player" account (e.g. to keep their listening history clean).
- English and German.

## Requirements

- A Spotify app in development mode from the [developer dashboard](https://developer.spotify.com/dashboard), owned by a Premium account. Development mode allows at most 5 Spotify users per app, and only hosts sign in with Spotify. See [docs/concept.md](docs/concept.md#spotify-platform-limits-why-it-is-built-this-way).
- Every host and player needs Spotify Premium and a place on the allowlist (5 accounts in total). The allowlist decides who may host; crowd-dj has no admin of its own.
- Docker, and a reverse proxy with HTTPS.

## Running

1. Create a Spotify app. Under redirect URIs add `https://dj.example.com/auth/callback` (your `ORIGIN` plus `/auth/callback`). Add every host and every player account to the allowlist (User Management).
2. Use [deploy/compose.yaml](deploy/compose.yaml), for example as a git stack with that compose path, and set the variables in the environment of the stack. Every variable is explained in [.env.example](.env.example).
3. Point your reverse proxy at the container on port 3000.
4. Hosts sign in from the start page. On **My account** (`/account`) they can connect a player: Spotify shows its account dialog, where they pick "Not you?" and sign in with the player. Its tokens are stored, encrypted; nobody stays signed in as it.

The database is created and migrated when the server starts.

### Sessions

- **Start:** a signed-in host starts a session on the start page; it plays through their player, else their own account. A host has at most one open session; starting again opens it.
- **Join:** everyone on the session page can show its link and QR code (**Invite**). Whoever opens it picks a name once and is in; no sign-in.
- **Settings** (host only, any time): how the next track is picked, anonymous, limits per person, skipping own tracks, skip voting.
- **End:** the host ends it, or it ends by itself after 30 minutes without anyone opening it. Then its link shows "This session has ended".

### Profiles

A participant's name is kept in a cookie of the browser (**My profile**, `/profile`). The personal link and QR code there let the person use the profile on another device too; opening it asks before it replaces the profile a device uses. Anyone with that link can act as the person, so it is meant for their own devices only.

### My account

- **Player:** connect, swap or disconnect (swapping and disconnecting delete the player's stored tokens). A host's own account or another host cannot become a player, and a player cannot sign in as a host: Spotify always shows which account signs in, so pick "Not you?" when it is the wrong one.
- **Token expiry:** Spotify refresh tokens expire 6 months after a sign-in. The host and the player show until when their sign-in is valid; two weeks before, they say "Expires soon", and a banner on every page asks the host to renew it. Signing in again (for the player: connecting it again) renews it. When Spotify revokes a token, or `APP_SECRET` was changed, it shows "Revoked".
- **Delete my account:** deletes the stored tokens of the host and the player and signs the host out everywhere.

## Configuration

| Variable                | Purpose                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                | Public URL without a trailing slash; the Spotify redirect URI is `<ORIGIN>/auth/callback`                                                   |
| `DATABASE_URL`          | SQLite database file as a libsql URL (the image sets `file:/data/crowd-dj.db`)                                                              |
| `SPOTIFY_CLIENT_ID`     | Client ID of the Spotify app                                                                                                                |
| `SPOTIFY_CLIENT_SECRET` | Client secret of the Spotify app (secret)                                                                                                   |
| `APP_SECRET`            | Key for encrypting stored tokens (secret, at least 32 characters; `openssl rand -base64 32`). Changing it makes every account sign in again |
| `TZ`                    | Time zone                                                                                                                                   |

## Development

Open the repository in its devcontainer (VS Code: "Reopen in Container"). It installs the dependencies, creates `.env` from `.env.example`, and starts the dev server at **http://127.0.0.1:5173** (use the IP, not `localhost`: Spotify accepts plain http redirect URIs only for loopback IPs). For Spotify sign-in, add `http://127.0.0.1:5173/auth/callback` as a second redirect URI to your Spotify app and fill in `.env`.

| Command               | Does                                                       |
| --------------------- | ---------------------------------------------------------- |
| `npm run check`       | Type check                                                 |
| `npm run lint`        | Prettier and ESLint                                        |
| `npm run format`      | Format everything                                          |
| `npm test`            | Unit tests (Vitest)                                        |
| `npm run build`       | Production build                                           |
| `npm run db:generate` | Migration from the schema (applied when the server starts) |

## License

[MIT](LICENSE)
