# Development commands of crowd-dj (see AGENTS.md, "Development"). AGENTS.md, skills and scripts
# call these recipes, not the tools.

set positional-arguments

# List the recipes
default:
    @just --list

# Type check, lint (Prettier, ESLint), unit tests
check:
    npm run check
    npm run lint
    npm test

# Format everything
fmt:
    npm run format

# Dev server with hot reload at http://127.0.0.1:5173 (settings from .env)
serve:
    npm run dev -- --host 0.0.0.0 --port 5173 --strictPort

# The demo: the image at http://127.0.0.1:8080 (Spotify sign-in only with your own app, see compose.yaml)
demo:
    docker compose up --build

# Prepare a release (changelog, version, commit, tag); the devcontainer cannot push, so push it on
# the host with: dev-kit-host push crowd-dj main v<version>
release version summary:
    dev-kit release "$1" -m "$2"

# Deploy the release on origin/main and wait until /healthz reports it
deploy:
    dev-kit deploy
