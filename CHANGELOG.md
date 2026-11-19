# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Light and dark theme (follows the system until you pick one in the header) and a language menu in the header (English, German), built for phones first. Everything is served by crowd-dj itself; no fonts or scripts are loaded from elsewhere.
- Spotify sign-in for hosts: everyone on the Spotify app's allowlist. Tokens are stored encrypted with `APP_SECRET` and refreshed automatically.
- "My account" page (`/account`): connect, swap and disconnect an optional player account that plays the host's sessions, see until when each sign-in is valid (with a warning two weeks before it expires), and delete the account.
- A banner on every page warns a host two weeks before their or their player's Spotify sign-in expires, and when it has expired, with a button to renew it.
- The database is created and migrated when the server starts.
- Project skeleton: SvelteKit with adapter-node, SQLite through Drizzle, English and German texts, a start page and `GET /healthz`.
- Container image and `deploy/compose.yaml` for running behind a reverse proxy.
- Devcontainer with Node, Claude Code and Docker.
- Concept in `docs/concept.md`.
