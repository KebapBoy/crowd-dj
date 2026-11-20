# Concept

How crowd-dj works and why it is built this way, for developers. How to use and run it is in the [README](../README.md); the rules for working on the code are in [AGENTS.md](../AGENTS.md).

## The idea

A group of people in one room (an office, a party) shares one speaker. A host starts a **session**, everyone else joins through a link or QR code, and everybody contributes music. crowd-dj picks the next track **in turns**, so nobody takes over the queue, and plays it through one Spotify account. Joining needs no Spotify sign-in, so it works for people without Spotify or without Premium.

Two kinds of music feed the turns:

- a **pool** per person: tracks they like, kept with their profile across sessions; when it is their turn and they have nothing more specific, one of them plays at random;
- **wishes** per session: concrete tracks someone wants to hear soon, played in the order they were wished.

The host picks per session how the two are combined. Everything else (the engine, the limits, the live page) exists to make that fair and to keep within what Spotify allows.

## Spotify platform limits

These shape every decision below. Sources at the end.

- **Development mode is the only mode available.** An app in development mode may be used by at most **5 Spotify users**, each added by hand (by e-mail) to the app's allowlist in the developer dashboard; anyone else gets 403. The owner of the app needs Premium. Extended quota is only for registered businesses with 250k monthly active users. Whether the owner takes one of the 5 places is undocumented; assume it does.
  → **Only hosts (and their players) sign in with Spotify.** Participants never do.
- **Playback control needs Premium** on the controlled account (play, skip, add to queue, read state).
- **Spotify's queue cannot be reordered, cleared or edited** through the API; you can only append.
  → crowd-dj keeps **its own queue** and hands Spotify only the next track, shortly before the current one ends.
- **Playlists:** items are only returned for playlists the user owns or collaborates on; other public playlists give metadata only.
  → crowd-dj does not read playlists. A whole playlist gets in by copying its track links in the Spotify desktop app (Ctrl+A, Ctrl+C) and pasting them.
- **Removed endpoints** (February 2026): `GET /users/{id}` (no names for user IDs), `GET /users/{id}/playlists`, batch lookups such as `GET /tracks?ids=` (look tracks up one by one with `GET /tracks/{id}` and cache them), `GET /artists/{id}/top-tracks`, browse and categories. `GET /me` no longer returns e-mail or product. Search returns at most 10 results per request. Still there: search for tracks, albums, artists and playlists; an artist's albums; an album's tracks. Playlist routes are `/playlists/{id}/items`.
- **Refresh tokens expire 6 months** after the original sign-in; then the user has to sign in again.
- **Quota is shared** by all apps of a developer account, and the rate limit counts per app.
- **Developer Policy:** no app may play content from one source to several simultaneous listeners (III.4), so the host's audio is never re-streamed; the music is heard only from the device that plays it. Show cover art and metadata with anything that plays (II.5). Do not use "Spotify" in the app's name.

## Roles

| Role        | Signs in with Spotify                            | What they do                                                                                                                |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Host        | Yes (Premium, on the allowlist)                  | Starts sessions; manages their own sign-in and player on "My account"                                                       |
| Player      | Connected by its host, never signs in on its own | Optional second Premium account of a host that plays the host's sessions instead of the host's own account                  |
| Participant | No                                               | Profile per browser: picks a name once, kept in a cookie; a personal link or QR code uses the profile on another device too |

**Who may host:** everyone Spotify lets sign in. The allowlist in the developer dashboard (at most 5 accounts, players included) is the access control; crowd-dj has no admin and no approval of its own, since that would only repeat the allowlist.

**Player:** a session plays through the host's player if one is connected, else through the host's own account. A player keeps the music out of the host's listening history (e.g. a free place in a family plan) and has to be signed in on the device at the speaker. It is connected through Spotify's account dialog ("Not you?"); an account that signs in on its own (a host) or is another host's player cannot become one, and a player cannot sign in as a host. Swapping or disconnecting a player deletes its stored tokens.

**Participant profiles:** a profile is a name and a random cookie token (the database keeps only its hash). The personal link carries the same token, so it moves the profile to another device; opening it asks before it replaces the profile a device uses, so a link preview or a stray scan changes nothing. The link stays valid as long as the profile exists. A browser signed in with Spotify (a host) gets a profile without asking, named after the account: the first word of the Spotify display name, else the Spotify username. The name follows the account (the display name is stored at every sign-in) and cannot be changed by hand while signed in, nor can such a browser switch to another profile through a personal link; after signing out the profile stays and can be renamed. Making it counts towards the limit of new profiles per address.

## Pools and wishes

### The pool

Every participant has one **pool** (`pool_item`: profile, track, when added). It belongs to the profile, not to a session, so it is filled once and plays in every later session. Participants add to it in a session (search results, a whole album, all pasted links at once) and remove from it there or on "My profile". Adding a track that is already in the pool makes it the newest again; adding is never refused.

A pool is ordered by **when a track was added**, newest first. The host's **pool limit** (optional, per session) is a window over that order: in that session only the person's newest _n_ tracks can be picked. Older tracks are kept and count again in sessions with a larger limit or none. So a person steers what plays of theirs simply by adding: whatever they added last is in the window.

### Wishes

A **wish** (`wish`: session, profile, track, when wished, when played) is a track someone wants to hear soon in this session. It is open until it is handed to Spotify, then played. Each track can be wished once per session (a unique index), and a track that already played in the session cannot be wished. An open wish can be taken back; that deletes it, so it counts for no limit. Taking it back and handing it to Spotify exclude each other: a wish only counts as played while it is still open.

The host's wish limits (optional, per session): **open wishes per person** at a time, and **wishes per person per session** (open and played). Both are checked in the same statement that inserts the wish (`wishes.ts`), so two requests at once cannot overrun them.

### Picking the next track

The picker (`picker.ts`) answers one question: which track plays next, and for whom. The host chooses a **mode** per session:

| Mode                | Order                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Wishes before pools | Open wishes in turns per person; when nobody has an open wish, a random track from the pool of whoever's turn it is (default) |
| Pools only          | A random track from the pool of whoever's turn it is; wishes are not offered                                                  |
| Wishes only         | Open wishes in turns per person, nothing from pools; with no open wish, nothing plays                                         |

**Whose turn it is:** everyone who joined the session and has not left takes part, also with their phone locked. They are sorted by when a track of theirs was last handed to Spotify (their last row in `play`), longest ago first; people who have had no track yet come first, in the order they joined. Then:

1. Unless the mode is "pools only", the first person in that order who has an open wish gets their **oldest open wish**. In "wishes before pools" this means open wishes of anyone go before every pool: a person who only has a pool waits while others still wish.
2. Unless the mode is "wishes only", the first person in that order who has a **candidate** in their pool gets one. Candidates are the newest tracks of their pool within the pool limit, minus every track that already played in the session and every track wished in it (it plays as a wish, or was taken back on purpose).
3. Otherwise there is nothing to play; the engine waits and asks again when something changes.

**Which pool track:** the candidates are ranked by a hash of session, person, number of plays in the session and track id, and the lowest wins. That is random across people and sessions, but stable: "up next" does not change on every page load, only when a track plays or the pool, the wishes or the members change.

**No track plays twice** in a session: `play` has a unique index on session and track, and both steps skip played tracks.

An example in "wishes before pools", with Ana, Ben and Cem joined in that order and nothing played yet: Ben has an open wish, so it plays first (Ana and Cem have no wish). Next, Ana and Cem have waited longest (never), Ben just had his turn; nobody has an open wish, so a random track from Ana's pool plays, then one from Cem's, then Ben again. Had Ben wished another track while Ana's played, his wish would have come before Cem's pool track, although Cem had waited longer: wishes go before pools.

## In a session

- **Joining:** the session's random id is its join link (and QR code, which everyone in the session can show). A visitor without a profile picks a name and is in; a signed-in host already has one. Only members may wish, change pools in the session and get live updates.
- **Leaving:** ends the person's turns; their open wishes no longer play, their pool stays. It is kept (`left_at`), so opening the session again does not join it again by itself, only **Join again** does.
- **Anonymous sessions:** nobody sees whom a track plays for, not even the host; everyone sees "yours" on their own tracks. The list of participants stays visible.
- **Settings:** the mode, anonymity and the limits can be changed by the host at any time; the next pick uses them. The session also stores skip settings (skipping own tracks, skip voting with thresholds); crowd-dj does not skip tracks, so they have no effect.
- **Starting the music:** the host presses play (picking a device when none is active); the same resumes a paused session. The engine never starts playing on its own before that.
- **Someone plays something else** in the Spotify app of the playing account: the session pauses (no more tracks handed to Spotify) and the host is offered to resume. A pause in the Spotify app just makes it wait. **Running dry:** when nothing was left to queue and Spotify goes on by itself (autoplay), that is a filler, not an interruption: the next track that comes up is queued after it. When Spotify plays nothing (stopped, or paused on something not from the session), the next track starts right away. A track of the session that Spotify plays a second time (it was in its queue twice) is no interruption either; nor is anything right after a restart, when the engine does not know what came before.
- **Ending:** the host ends it, or it ends by itself after 30 minutes without a sign of life: a visit, an open session page, or a track of the session playing (not one paused in Spotify). Then the join link stops working. A host has at most one open session (a unique index on open sessions); since a player belongs to exactly one host, that is also one per playing account.
- The playing track always shows cover art, title, artists and a link back to Spotify.

## Architecture

- **One container:** SvelteKit (adapter-node), SQLite through Drizzle and the libsql client, live updates with server-sent events. One process serves everything, so state that only lives as long as the process (events, rate limits, the engine's memory) is kept in memory.
- **Session engine** (`engine.ts`, one loop per session that plays): polls `GET /me/player` of the playing account every 5 seconds, more often shortly before a track ends, every 10 seconds without a device, every 30 after an error, not at all while stopped or paused. About 15 seconds before the current track ends it asks the picker and sends the result with `POST /me/player/queue`; when Spotify plays it, the previous one ends and every page is notified. Exactly one track of crowd-dj's queue is in Spotify's queue at a time. Each track handed to Spotify is a row in `play` (queued, started, ended); a wish counts as played once handed over. Changes in the session (a wish, a pool) bring the next look forward to 2 seconds at most, never push it back. Items without a track or length (episodes, ads) time nothing: they are polled every 5 seconds, nothing is queued by them. After a restart, the engine picks up the sessions that were playing.
- **Play and resume:** the host's play starts the next track with `PUT /me/player/play` (on a device from `GET /me/player/devices` if chosen; a device change while a track plays uses `PUT /me/player`). Resuming a paused session first checks the player and Spotify's queue (`GET /me/player/queue`): the queued track that already plays is kept, one that is next in the queue is skipped to with `POST /me/player/next` (after moving playback to a chosen device), so it does not play twice, and one that is gone has played meanwhile and is followed by the next track.
- **"Now playing" and "up next"** (`playing.ts`): the current track from the engine's last look at the player, the next one from the picker, so "up next" may still change until it is handed to Spotify.
- **Live updates** (`events.ts`): each session page holds a server-sent events connection (`/s/<id>/events`); the server sends `change` when something the page shows changed and the page reloads its data. Changes within 500 ms are sent once, and pages spread their reloads over a second. At most 300 open pages per session (the host's do not count, so nobody can lock them out) and 5 per person; a page beyond that gets 429 and no live updates. An open page is a sign of life. Each participant can make 60 changes a minute, since each one reloads every open page.
- **Search and links** (`catalog.ts`) use the host account's token: one search request returns up to 10 tracks, albums and artists; an artist's albums come 10 at a time, an album with its tracks in one request (up to 50 tracks, a second page up to 100). Pasted links are looked up one at a time (up to 100 per paste).
- **Caching:** tracks from results and lookups are kept in the database (`track`), IDs Spotify did not know in memory for an hour, search results, albums and pages of an artist's albums for 10 minutes.
- **Rate limits:** calls to Spotify that participants cause are limited per minute for each participant (100), each session (150, since profiles are free to make) and the instance (300); cached answers cost nothing. After a 429 every call waits for its `Retry-After`, since Spotify's limit counts per app. New profiles are limited to 30 an hour per client address (a room behind one router shares one; IPv6 counts by its /64), with no limit for the whole instance, which a few addresses could use up to keep everyone out; behind a reverse proxy the address comes from adapter-node's `ADDRESS_HEADER` and `XFF_DEPTH`.
- **Quota:** poll only while a session plays; look tracks up one at a time and cache them.
- **Secrets:** stored Spotify tokens are encrypted with `APP_SECRET` (AES-256-GCM). The sign-in cookie of a host and the cookie of a profile hold random tokens; the database keeps only their hashes. One sign-in asks for every scope in `SCOPES` (`spotify/oauth.ts`), so hosts consent once.
- **Data model:** `spotify_account` (hosts and their players via `player_of`, encrypted tokens, sign-in time for the 6-month expiry), `login` (browsers signed in with Spotify), `profile` (name, token hash), `session` (host, mode, anonymity, limits, skip settings, playback: stopped, playing or paused, last sign of life), `session_member` (joined, left), `track` (cache), `pool_item` (profile, track, when added), `wish` (session, profile, track, when played; unique per session and track), `play` (session, track, for whom, the wish; queued, started, ended; unique per session and track), `setting` (instance settings).
- **Configuration:** environment variables, declared in `src/env.ts` and explained in `.env.example`.
- **Languages:** English and German (Paraglide, `messages/`); the browser's language, or the one picked in the app.

## Sources

- [Web API changes, February 2026](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
- [February 2026 migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide)
- [Quota modes](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)
- [Spotify Developer Policy](https://developer.spotify.com/policy)
