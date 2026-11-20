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

Search and pasted links are in the session, since they use the host's token; "My profile" shows the pool and removes tracks from it. A track added again counts as newly added.

A **wish** is a concrete track someone wants to hear soon. Each track can be wished once per session. Open wishes can be taken back (they then count for no limit); reordering them comes later.

### Picking the next track

The host picks one mode per session:

1. **Wishes before pools:** open wishes, in turns per person; when no wish is open, a random track from the next person's pool.
2. **Pools only:** in turns per person, a random track from their pool.
3. **Wishes only:** in turns per person, in the order they wished.

No track plays twice in a session.

### Limits (each optional, set by the host)

- Open wishes per person at a time.
- Wishes per person per session.
- Pool size per person. Pools outlive sessions, so in a session with a limit only the person's **newest** tracks count for picking; adding is never refused and older tracks are kept. When someone's inbox tracks exceed it, crowd-dj **removes their oldest extra tracks from the playlist**.

## In a session

- **Anonymous sessions:** nobody sees who wished or added a track, not even the host; everyone sees "yours" on their own tracks. The list of participants stays visible.
- **Skipping:** the host can always skip. Whether people may skip their own tracks without a vote is a session setting. **Skip voting** (optional): a track is skipped when it has at least X votes and Y % of the active participants voted (X and Y set by the host).
- **Joining:** the session's random id is its join link (and QR code, which everyone in the session can show). A visitor without a profile picks a name and is in.
- **Starting the music:** the host presses play (picking a device when none is active); the same resumes a paused session. The engine never starts playing on its own before that.
- **Leaving:** everyone who joined takes part in the turns, also with their phone locked (fill your pool, put the phone away), until they leave the session. Leaving ends their turns and their open wishes no longer play; it is kept (`left_at`), so opening the session again does not join it again by itself, only **Join again** does. Only participants in the session may wish, change pools there and get live updates.
- **Ending:** the host ends it, or it ends by itself after 30 minutes without a sign of life: a visit, an open session page, or a track of the session playing (not one paused in Spotify). Then the join link stops working. At most one session per playing account at a time: since a player belongs to exactly one host, this is one open session per host (a unique index on open sessions).
- **Someone plays something else** in the Spotify app of the playing account: the session pauses (no more tracks handed to Spotify) and crowd-dj offers "Session paused – resume?". A pause in the Spotify app just makes it wait. **Running dry:** when nothing was left to queue and Spotify goes on by itself (autoplay), that is a filler, not an interruption: the next track that comes up is queued after it. When Spotify plays nothing (stopped, or paused on something not from the session), the next track starts right away. A track of the session that Spotify plays a second time (it was in its queue twice) is no interruption either; nor is anything right after a restart, when the engine does not know what came before.
- The playing track always shows cover art, title, artists and a link back to Spotify.

## Architecture

- One container: SvelteKit (adapter-node), SQLite through Drizzle and the libsql client, live updates with server-sent events.
- **Session engine** (`engine.ts`, server side, one loop per session that plays): polls `GET /me/player` of the playing account (the host's player, else the host) every 5 seconds, more often shortly before a track ends, every 10 seconds without a device, every 30 after an error, not at all while stopped or paused. About 15 seconds before the current track ends it picks the next one (`picker.ts`) and sends it with `POST /me/player/queue`; when Spotify plays it, the previous one ends and everyone is notified. The host's play starts the next track with `PUT /me/player/play` (on a device from `GET /me/player/devices` if chosen; a device change while a track plays uses `PUT /me/player`); resuming a paused session first checks the player and Spotify's queue (`GET /me/player/queue`): the queued track that already plays is kept, one that is next in the queue is skipped to with `POST /me/player/next` (after moving playback to a chosen device), so it does not play twice, and one that is gone has played meanwhile and is followed by the next track. Exactly one track of crowd-dj's queue is in Spotify's queue at a time. Each track handed to Spotify is a row in `play` (queued, started, ended); a wish counts as played once handed over (only while it is still open, so taking it back and handing it over exclude each other). Items without a track or length (episodes, ads) time nothing: polled every 5 seconds, nothing queued by them. Changes in the session (a wish, a pool) bring the next look forward to 2 seconds at most, never push it back. After a restart, the engine picks up the sessions that were playing. Skip (`POST /me/player/next`) and votes come with the skip step.
- **Turns:** whoever has waited longest for a track of theirs (their last row in `play`) comes first, newcomers in the order they joined. In "wishes before pools", open wishes of anyone go before every pool. A pool track is picked by a stable random order (a hash of session, person, number of plays and track), so "up next" does not change on every reload, only when a track plays or the pools or wishes change. Tracks wished in the session are not taken from pools.
- **Live updates:** each session page holds a server-sent events connection (`/s/<id>/events`); the server sends `change` when something the page shows changed and the page reloads its data. In memory, since one process serves everything; changes within 500 ms are sent once, and pages spread their reloads over a second. At most 300 open pages per session (the host's do not count, so nobody can lock them out) and 5 per person; a page beyond that gets 429 and no live updates. An open page is a sign of life. Each participant can make 60 changes a minute, since each one reloads every open page.
- **Inbox sync:** polls the inbox playlists every 30 to 60 seconds, using `snapshot_id` to skip unchanged ones.
- **Search and links** use the host account's token: one search request returns up to 10 tracks, albums and artists; an artist's albums come 10 at a time, an album with its tracks in one request (up to 50 tracks, a second page up to 100). Tracks from results and lookups are cached in the database, IDs Spotify did not know in memory for an hour, search results, albums and pages of an artist's albums for 10 minutes. Calls to Spotify that participants cause are limited per minute for each participant (100), each session (150, since profiles are free to make) and the instance (300); cached answers cost nothing. After a 429 every call waits for its `Retry-After`, since Spotify's limit counts per app. New profiles are limited as well: 30 an hour per client address (a room behind one router shares one; IPv6 counts by its /64), with no limit for the whole instance, which a few addresses could use up to keep everyone out; behind a reverse proxy the address comes from adapter-node's `ADDRESS_HEADER` and `XFF_DEPTH`.
- **Data model (rough):** `spotify_account` (hosts and their players via `player_of`, encrypted tokens, sign-in time for the 6-month expiry), `profiles` (name, cookie token, optional Spotify user ID), `sessions` (host account, settings, join code, playback: stopped, playing or paused), `session_members`, `pool_item` (profile, track, when added), `wish` (session, profile, track, when played; unique per session and track), `play` (session, track, for whom, the wish; queued, started, ended; unique per session and track), `skip_votes`, `track` (cache), `setting` (instance settings), `login` (browsers signed in with Spotify; the cookie holds a random token, the table its hash).
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
