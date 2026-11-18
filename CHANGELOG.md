# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Spotify sign-in for hosts and the admin. Tokens are stored encrypted with `APP_SECRET` and refreshed automatically.
- Admin page (`/admin`): connect, swap and disconnect the room account, approve and remove personal hosts, and see until when each sign-in is valid (with a warning two weeks before it expires).
- The database is created and migrated when the server starts.
- Project skeleton: SvelteKit with adapter-node, SQLite through Drizzle, English and German texts, a start page and `GET /healthz`.
- Container image and `deploy/compose.yaml` for running behind a reverse proxy.
- Devcontainer with Node, Claude Code and Docker.
- Concept in `docs/concept.md`.
