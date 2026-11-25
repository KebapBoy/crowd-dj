# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Someone in two sessions can no longer use up the searches and lookups of the whole instance: once the instance limit per minute ran out, the sessions of hosts that used less than their fair share of it keep searching.
- An account that signs in as a host at the same moment as a host connects it as their player can no longer end up as both: one of the two wins, the other is refused.

## [0.2.0] - 2026-11-22

### Added

- Skipping: **Skip** under "Now playing" skips the track that plays, for the host at any time and for the person it plays for when the session allows skipping own tracks; the next track plays right away. With skip voting on, everyone else in the session can vote to skip (and take the vote back) and sees how many votes it takes; the track is skipped once it has the host's minimum number of votes and the host's share of the participants who are there (who have the session open or voted), but never more votes than there are people to vote. Votes count only for the track they were given to, and only from people still in the session who were there when it started and have added something (a wish or a track in their pool). A track paused in Spotify is not skipped, and a session allows 10 skips a minute. The skip settings of a session, so far only stored, now take effect.

### Changed

- `/healthz` answers with JSON that names the running version (`{"status":"ok","version":"x.y.z"}`) instead of a plain `ok`.
- The image runs as user `crowd-dj` (same UID 1000 as before, so `/data` needs no change), carries OCI labels and gets a start period for its health check. `deploy/compose.yaml` runs it hardened: read-only file system (state only in `/data`, scratch in `/tmp`), no capabilities, no gaining privileges.
- crowd-dj asks Spotify only for what it needs. Signing in as a host only reads your profile; only the account that plays your sessions allows crowd-dj to read and control its playback, and nothing asks for playlists any more. Without a player, allow your own account to play once on **My account** (**Play through my account**); later sign-ins keep that by themselves. Accounts signed in before keep working as they are.

## [0.1.0] - 2026-11-20

### Added

- A browser signed in with Spotify gets its profile without asking for a name: the first name from the Spotify account, else the Spotify username. The name follows the account and is no longer set by hand while signed in, and a signed-in browser cannot switch to another profile through a personal link.
- The session engine: the host presses **Play** (and picks a device if none is active), and crowd-dj plays the session's music in turns through the playing account. Shortly before a track ends it picks the next one by the session's mode (open wishes of whoever waited longest, else a random track from their pool, within the pool limit) and hands it to Spotify's queue; no track plays twice in a session. When someone plays something else on the account, the session pauses until the host resumes; autoplay after the music ran out is tolerated, and the next track is queued after it. Without an active device, with an expired sign-in or when Spotify refuses, the host is told what to do.
- "Now playing" and "Up next" on the session page, with cover, position and for whom a track plays (in anonymous sessions only "yours"), and live updates: the page updates itself when a track starts, someone wishes, joins or leaves, or the settings change.
- Leaving a session: a participant's turns end and their open wishes no longer play, until they join it again on purpose (**Join again**). Only participants in a session can wish and change pools there; each can make 60 such changes a minute.
- Music in sessions: participants search tracks, albums and artists (artist → albums → tracks) through the host's Spotify account, or paste track links copied in the Spotify apps (up to 100 at a time; an album link opens the album, with up to 100 tracks). A track can be wished for the session or added to the person's pool, a whole album or all pasted tracks at once to the pool. Open wishes can be taken back. The host's limits apply: open wishes at a time and wishes per session refuse further wishes, and the pool limit counts only the person's newest tracks in that session. Pools are kept in the profile and shown on "My profile", where tracks can be removed too. Tracks are looked up once and kept, search results, albums and an artist's albums for 10 minutes, and calls to Spotify are limited per minute for each participant, each session and the whole instance, so the Spotify quota the hosts share lasts; after Spotify answers "too many requests", crowd-dj waits as long as it asks.
- Sessions: a signed-in host starts one from the start page (at most one at a time; it plays through the host's player, else their own account). Everyone in it can show its join link and QR code. The host sets how the next track is picked, anonymity, limits per person and skipping (own tracks, voting) at any time, and ends it; it also ends by itself after 30 minutes without anyone opening it, and its link then stops working.
- Participant profiles without sign-in: a name, kept in a cookie of the browser, asked for when joining a session. "My profile" (`/profile`) changes the name and shows a personal link and QR code to use the profile on another device too (after asking there). New profiles are limited to 30 an hour per address (IPv6: per /64); behind a reverse proxy set `ADDRESS_HEADER` and `XFF_DEPTH` (`deploy/compose.yaml` does) so the visitor's address counts, not the proxy's.
- New look for all pages, built for phones first: light and dark theme (follows the system until you pick one in the header), a language menu in the header (English, German), confirmation dialogs for disconnecting the player and deleting the account, and a short message after each action. Everything is served by crowd-dj itself; no fonts or scripts are loaded from elsewhere.
- Spotify sign-in for hosts: everyone on the Spotify app's allowlist. Tokens are stored encrypted with `APP_SECRET` and refreshed automatically.
- "My account" page (`/account`): connect, swap and disconnect an optional player account that plays the host's sessions, see until when each sign-in is valid (with a warning two weeks before it expires), and delete the account.
- A banner on every page warns a host two weeks before their or their player's Spotify sign-in expires, and when it has expired, with a button to renew it.
- The database is created and migrated when the server starts.
- Project skeleton: SvelteKit with adapter-node, SQLite through Drizzle, English and German texts, a start page and `GET /healthz`.
- Container image and `deploy/compose.yaml` for running behind a reverse proxy.
- Devcontainer with Node, Claude Code and Docker.
- Documentation: the README for people who use and run crowd-dj (including what it does not do, what may come, and how it differs from Spotify Jam), `docs/concept.md` on how it works and why (pools, wishes and the turns in detail), and `AGENTS.md` for working on the code.

### Changed

- A session now ends by itself after 30 minutes in which none of its tracks played and nobody had it open (before: nobody opened it). An open session page keeps it alive, instead of reloading every 5 minutes.
- A track that played in a session can no longer be wished in it.

### Fixed

- The skip settings of a session now say that skipping is coming soon, instead of suggesting that it already works.
- Pages and requests that arrive while a host connects their player no longer fail.
- When Spotify refuses the host's account (for example after it was taken off the Spotify app's allowlist), searching in a session says so and asks to tell the host, instead of saying that Spotify cannot be reached.
