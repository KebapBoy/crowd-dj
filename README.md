# crowd-dj

A shared music queue for a room full of people. Someone starts a session, everyone joins with a link or QR code and adds music, and crowd-dj plays it **in turns** through one Spotify account on the room's speaker. Participants do not need a Spotify account.

> **Status:** early development. Working so far: Spotify sign-in for hosts and the "My account" page (optional player account, token expiry), participant profiles, sessions with join link, QR code and settings, music (search, pasted links, wishes and pools with the host's limits) and the engine that plays it in turns, with "now playing", "up next" and live updates. Skipping, skip voting and the inbox playlists come next. What it will do and why is in [docs/concept.md](docs/concept.md).

## Features (some planned)

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
3. Point your reverse proxy at the container on port 3000. Session pages get live updates as server-sent events (`/s/<id>/events`); crowd-dj asks proxies not to buffer them (`X-Accel-Buffering: no`, which nginx and SWAG follow) and sends a ping every 25 seconds, so the usual read timeouts of 60 seconds are fine. crowd-dj limits new profiles per visitor address, so the proxy has to set or append `X-Forwarded-For` (SWAG, Caddy, Traefik and nginx with `$proxy_add_x_forwarded_for` do), and `XFF_DEPTH` has to match the number of proxies that append to it (the compose file assumes one). Do not publish port 3000 next to the proxy: a client talking to it directly could make up its address. Without the header the log says so once, and all such visitors share one limit.
4. Hosts sign in from the start page. On **My account** (`/account`) they can connect a player: Spotify shows its account dialog, where they pick "Not you?" and sign in with the player. Its tokens are stored, encrypted; nobody stays signed in as it.

The database is created and migrated when the server starts.

### Sessions

- **Start:** a signed-in host starts a session on the start page; it plays through their player, else their own account. A host has at most one open session; starting again opens it.
- **Join:** everyone on the session page can show its link and QR code (**Invite**). Whoever opens it picks a name once and is in; no sign-in.
- **Settings** (host only, any time): how the next track is picked, anonymous, limits per person, skipping own tracks, skip voting.
- **Leave:** a participant leaves under **Participants**: their turns end and their open wishes no longer play; their pool stays. Opening the session again shows **Join again**.
- **End:** the host ends it, or it ends by itself after 30 minutes in which none of its tracks played and nobody had it open. Then its link shows "This session has ended".

### Playing

The session page shows **Now playing** (cover, title, artists, album, position, for whom it plays) and **Up next**, and updates itself when something changes.

- **Start:** the music starts when the host presses **Play** (also offered while nothing of the session plays, e.g. after it waited for music). Spotify has to be open on the device at the speaker, signed in as the account that plays (the player, else the host). Without an active device, **Device** lists the devices of that account; picking one starts the music there (or moves it there while it plays).
- **In turns:** about 15 seconds before a track ends, crowd-dj picks the next one by the session's mode and hands it to Spotify's queue. Whoever has waited longest for a track of theirs comes first: their oldest open wish, or a random track from their pool (within the pool limit, newest first). Everyone who joined counts, also with their phone locked, until they leave. No track plays twice in a session, and a wish counts as played as soon as it is handed to Spotify.
- **Up next** shows the track that comes next. Until it is handed to Spotify it may still change, for example when someone wishes a track.
- **Someone plays something else** on the account in the Spotify app: the session pauses (no more tracks are handed to Spotify) and the host can **Resume**; the track that was already in Spotify's queue then plays (skipped to, so it does not play twice), unless it played meanwhile. Pausing in the Spotify app just makes crowd-dj wait. When there is nothing left to play and Spotify goes on by itself (autoplay), that is fine: the next wish or pool track is queued after the track that plays. When Spotify plays nothing (stopped, or paused on something that is not from the session), the next track starts right away.
- **Quota:** crowd-dj asks the playing account's player what it does every 5 seconds while a session plays (a little more often in the last seconds of a track, and within 2 seconds after a change while it waits for music), every 10 seconds without a device and every 30 seconds after an error, and not at all while the session is stopped or paused. Each participant can make 60 changes (wishes, pool, leaving) a minute.

### Music

Everyone in a session finds music under **Music → Search**: tracks, albums and artists (an artist opens their albums, an album its tracks), looked up through the host's Spotify account. Pasting links works too: in the Spotify desktop app, select tracks (Ctrl+A for a whole playlist), copy them (Ctrl+C) and paste them into the search field (up to 100 at a time); an album link opens the album. Each track has a menu:

- **Wish:** a track to hear soon in this session. Each track can be wished once per session; open wishes can be taken back (**Wishes** tab). Not offered when the session plays pools only.
- **Add to pool:** tracks the person likes, kept in their profile for every later session (**Pool** tab, and on **My profile**). Adding a track again makes it the newest. Albums and pasted links can be added at once.

The host's limits per person apply: open wishes at a time and wishes per session refuse further wishes; the pool limit counts only the newest tracks of a pool in that session, the older ones stay but do not count. To spare the Spotify quota the hosts share, tracks are looked up once and kept, and calls to Spotify are limited per minute: 100 for each participant, 150 for a session, 300 for the whole instance (cached answers are free). Albums show up to 100 tracks.

### Profiles

A participant's name is kept in a cookie of the browser (**My profile**, `/profile`). The personal link and QR code there let the person use the profile on another device too; opening it asks before it replaces the profile a device uses. Anyone with that link can act as the person, so it is meant for their own devices only.

### My account

- **Player:** connect, swap or disconnect (swapping and disconnecting delete the player's stored tokens). A host's own account or another host cannot become a player, and a player cannot sign in as a host: Spotify always shows which account signs in, so pick "Not you?" when it is the wrong one.
- **Token expiry:** Spotify refresh tokens expire 6 months after a sign-in. The host and the player show until when their sign-in is valid; two weeks before, they say "Expires soon", and a banner on every page asks the host to renew it. Signing in again (for the player: connecting it again) renews it. When Spotify revokes a token, or `APP_SECRET` was changed, it shows "Revoked".
- **Delete my account:** deletes the stored tokens of the host and the player and signs the host out everywhere.

## Configuration

| Variable                | Purpose                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORIGIN`                | Public URL without a trailing slash; the Spotify redirect URI is `<ORIGIN>/auth/callback`                                                    |
| `DATABASE_URL`          | SQLite database file as a libsql URL (the image sets `file:/data/crowd-dj.db`)                                                               |
| `SPOTIFY_CLIENT_ID`     | Client ID of the Spotify app                                                                                                                 |
| `SPOTIFY_CLIENT_SECRET` | Client secret of the Spotify app (secret)                                                                                                    |
| `APP_SECRET`            | Key for encrypting stored tokens (secret, at least 32 characters; `openssl rand -base64 32`). Changing it makes every account sign in again  |
| `ADDRESS_HEADER`        | Request header with the visitor's address behind a reverse proxy, used to limit new profiles per address (compose default `X-Forwarded-For`) |
| `XFF_DEPTH`             | How many proxies append to `X-Forwarded-For` (compose default `1`)                                                                           |
| `TZ`                    | Time zone                                                                                                                                    |

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
