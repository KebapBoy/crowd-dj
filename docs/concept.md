# Concept

What crowd-dj does, the decisions behind it, and the limits of the Spotify platform it is built around. State: November 2026. The README says how to use and run it; this file says what to build and why.

## The idea

A group of people in one room (an office, a party) shares one speaker. Someone starts a **session**, everyone else joins through a link or QR code, and everybody contributes music. crowd-dj picks the next track **in turns**, so nobody takes over the queue, and plays it through one Spotify account. Joining needs no Spotify sign-in, so it works from anywhere and for people without Premium.

## Spotify platform limits (why it is built this way)

These shape every decision below. Sources at the end.

- **Development mode is the only mode we get.** An app in development mode may be used by at most **5 Spotify users**, each added by hand (by e-mail) to the app's allowlist in the developer dashboard; anyone else gets 403. The owner of the app needs Premium. Extended quota is only for registered businesses with 250k monthly active users. Whether the owner takes one of the 5 places is undocumented; assume it does.
  → **Only hosts sign in with Spotify.** Participants never do.
- **Playback control needs Premium** on the controlled account (play, skip, add to queue, read state).
- **Spotify's queue cannot be reordered, cleared or edited** through the API; you can only append.
  → crowd-dj keeps **its own queue** and hands Spotify only the next track, shortly before the current one ends.
- **Playlists:** items are only returned for playlists the user owns or collaborates on; other public playlists give metadata only. Each item has `added_by` (a Spotify user ID). Collaborative playlists can be created through the API (non-public only), but collaborators cannot be added through it: that takes an invite link made in the Spotify app.
- **Removed endpoints** (February 2026): `GET /users/{id}` (no names for user IDs), `GET /users/{id}/playlists`, batch lookups such as `GET /tracks?ids=` (look tracks up one by one with `GET /tracks/{id}` and cache them), `GET /artists/{id}/top-tracks`, browse and categories. `GET /me` no longer returns e-mail or product. Search returns at most 10 results per request. Still there: search for tracks, albums, artists and playlists; an artist's albums; an album's tracks. Playlist routes are `/playlists/{id}/items`.
- **Refresh tokens expire 6 months** after the original sign-in; then the user has to sign in again.
- **Quota is shared** by all apps of a developer account.
- **Developer Policy:** no app may play content from one source to several simultaneous listeners (III.4), so the host's audio must never be re-streamed; listening along only works by playing on each listener's own Premium account. Show cover art and metadata with anything that plays (II.5). Do not use "Spotify" in the app's name.

## Roles

| Role        | Signs in with Spotify                            | What they do                                                                                                                |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Host        | Yes (Premium, on the allowlist)                  | Starts sessions; manages their own sign-in and player on "My account"                                                       |
| Player      | Connected by its host, never signs in on its own | Optional second Premium account of a host that plays the host's sessions instead of the host's own account                  |
| Participant | No                                               | Profile per browser: picks a name once, kept in a cookie; a personal link or QR code uses the profile on another device too |

The personal link carries the profile's cookie token (the database keeps only its hash). Opening it asks before it replaces the profile a device uses, so a link preview or a stray scan changes nothing. The link cannot be revoked yet (later: a new link that invalidates the old one).

**Who may host:** everyone Spotify lets sign in. The allowlist in the developer dashboard (at most 5 accounts, players included) is the access control; crowd-dj has no admin and no approval of its own, since that would only repeat the allowlist.

**Player:** a session plays through the host's player if one is connected, else through the host's own account. A player keeps the music out of the host's listening history (e.g. a free place in a family plan) and has to be signed in on the device at the speaker. It is connected through Spotify's account dialog ("Not you?"); an account that signs in on its own (a host) or is another host's player cannot become one, and a player cannot sign in as a host. Swapping or disconnecting a player deletes its stored tokens.

## Music

Every participant has a **pool**: tracks they would like to hear, kept across sessions. They fill it

- in the **Spotify app**, by adding tracks to an **inbox playlist**: a collaborative playlist of the host account. crowd-dj reads it with the host's token and assigns each track to a profile through `added_by` (a participant links their Spotify profile once by pasting their profile link). Every host account has a **permanent inbox**; a host can also create a **session inbox** when starting a session (with its own invite link, made in the Spotify app and pasted into crowd-dj). A pool is the union of both.
- in **crowd-dj**: search (tracks, albums, artists → albums → tracks) and pasting track links. In the Spotify desktop app, selecting all tracks of a playlist (Ctrl+A) and copying them (Ctrl+C) gives a list of track links, which is how a whole playlist gets in.

A **wish** is a concrete track someone wants to hear soon.

### Picking the next track

The host picks one mode per session:

1. **Wishes before pools:** open wishes, in turns per person; when no wish is open, a random track from the next person's pool.
2. **Pools only:** in turns per person, a random track from their pool.
3. **Wishes only:** in turns per person, in the order they wished.

No track plays twice in a session.

### Limits (each optional, set by the host)

- Open wishes per person at a time.
- Wishes per person per session.
- Pool size per person. When someone's inbox tracks exceed it, crowd-dj **removes their oldest extra tracks from the playlist**.

## In a session

- **Anonymous sessions:** nobody sees who wished or added a track, not even the host; everyone sees "yours" on their own tracks. The list of participants stays visible.
- **Skipping:** the host can always skip. Whether people may skip their own tracks without a vote is a session setting. **Skip voting** (optional): a track is skipped when it has at least X votes and Y % of the active participants voted (X and Y set by the host).
- **Joining:** the session's random id is its join link (and QR code, which everyone in the session can show). A visitor without a profile picks a name and is in.
- **Ending:** the host ends it, or it ends by itself after 30 minutes without a sign of life. Then the join link stops working. Until the engine and live updates exist, a sign of life is someone opening the session; later also a playing track or a connected participant. At most one session per playing account at a time: since a player belongs to exactly one host, this is one open session per host (a unique index on open sessions).
- **Someone plays something else** in the Spotify app of the playing account: the session pauses (no more tracks handed to Spotify) and crowd-dj offers "Session paused – resume?". A pause in the Spotify app just makes it wait.
- The playing track always shows cover art, title, artists and a link back to Spotify.

## Architecture

- One container: SvelteKit (adapter-node), SQLite through Drizzle and the libsql client, live updates with server-sent events.
- **Session engine** (server side, one per active session): polls `GET /me/player` of the playing account (the host's player, else the host) every 2 to 5 seconds. About 15 seconds before the current track ends it picks the next one by the session's mode and sends it with `POST /me/player/queue`; on a track change it marks the track as played, resets votes and notifies everyone. Skip: `POST /me/player/next`. No active device: tell the host and offer the devices from `GET /me/player/devices` (transfer playback). Exactly one track of crowd-dj's queue is in Spotify's queue at a time.
- **Inbox sync:** polls the inbox playlists every 30 to 60 seconds, using `snapshot_id` to skip unchanged ones.
- **Search and links** use the host account's token. Tracks are cached in the database.
- **Data model (rough):** `spotify_account` (hosts and their players via `player_of`, encrypted tokens, sign-in time for the 6-month expiry), `profiles` (name, cookie token, optional Spotify user ID), `sessions` (host account, settings, join code, state), `session_members`, `pool_items`, `wishes`, `plays`, `skip_votes`, `tracks` (cache), `setting` (instance settings), `login` (browsers signed in with Spotify; the cookie holds a random token, the table its hash).
- **Configuration:** see `.env.example`. Stored Spotify tokens are encrypted with `APP_SECRET` (AES-256-GCM). One sign-in asks for every scope crowd-dj will need (playback state and control, private and collaborative playlists), so hosts consent once.
- **Quota:** poll only while sessions are active; cache tracks.
- **Languages:** English and German (Paraglide, `messages/`); the browser's language, or the one picked in the app.

## Scope

**MVP:** host sign-in with "My account" (player, token status); participant profiles; sessions with join link, QR code and settings; pools and wishes (search, pasted links, inbox playlists); the session engine with skip and skip voting; "now playing" and "up next".

**Later:**

- **Listening along** from elsewhere: a listener signs in with their own Premium account (one allowlist place each) and plays either in a browser tab of crowd-dj (Web Playback SDK, desktop browsers only) or on their running Spotify app; crowd-dj starts the same track at the same position.
- Share target on Android (PWA), so "Share → crowd-dj" adds a track.
- **Shared player:** a host marks their player as shared and sets a start code; anyone who knows the code starts a session on it without a Spotify sign-in. Worth it once a player is permanently connected to a speaker in the room (then colleagues without an allowlist place can start sessions).

## Sources

- [Web API changes, February 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify Developer Policy](https://developer.spotify.com/policy)
