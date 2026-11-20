# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Music in sessions: participants search tracks, albums and artists (artist → albums → tracks) through the host's Spotify account, or paste track links copied in the Spotify apps (up to 100 at a time; an album link opens the album, with up to 100 tracks). A track can be wished for the session or added to the person's pool, a whole album or all pasted tracks at once to the pool. Open wishes can be taken back. The host's limits apply: open wishes at a time and wishes per session refuse further wishes, and the pool limit counts only the person's newest tracks in that session. Pools are kept in the profile and shown on "My profile", where tracks can be removed too. Tracks are looked up once and kept, search results for 10 minutes, and calls to Spotify are limited per minute for each participant, each session and the whole instance, so the Spotify quota the hosts share lasts; after Spotify answers "too many requests", crowd-dj waits as long as it asks.

- Sessions: a signed-in host starts one from the start page (at most one at a time; it plays through the host's player, else their own account). Everyone in it can show its join link and QR code. The host sets how the next track is picked, anonymity, limits per person and skipping (own tracks, voting) at any time, and ends it; it also ends by itself after 30 minutes without anyone opening it, and its link then stops working.
- Participant profiles without sign-in: a name, kept in a cookie of the browser, asked for when joining a session. "My profile" (`/profile`) changes the name and shows a personal link and QR code to use the profile on another device too (after asking there).
- New look for all pages, built for phones first: light and dark theme (follows the system until you pick one in the header), a language menu in the header (English, German), confirmation dialogs for disconnecting the player and deleting the account, and a short message after each action. Everything is served by crowd-dj itself; no fonts or scripts are loaded from elsewhere.
- Spotify sign-in for hosts: everyone on the Spotify app's allowlist. Tokens are stored encrypted with `APP_SECRET` and refreshed automatically.
- "My account" page (`/account`): connect, swap and disconnect an optional player account that plays the host's sessions, see until when each sign-in is valid (with a warning two weeks before it expires), and delete the account.
- A banner on every page warns a host two weeks before their or their player's Spotify sign-in expires, and when it has expired, with a button to renew it.
- The database is created and migrated when the server starts.
- Project skeleton: SvelteKit with adapter-node, SQLite through Drizzle, English and German texts, a start page and `GET /healthz`.
- Container image and `deploy/compose.yaml` for running behind a reverse proxy.
- Devcontainer with Node, Claude Code and Docker.
- Concept in `docs/concept.md`.

### Fixed

- Pages and requests that arrive while a host connects their player no longer fail.
- When Spotify refuses the host's account (for example after it was taken off the Spotify app's allowlist), searching in a session says so and asks to tell the host, instead of saying that Spotify cannot be reached.
