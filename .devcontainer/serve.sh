#!/bin/sh
# Dev server of the devcontainer: the working tree with hot reload at http://127.0.0.1:5173.
# Started by postStartCommand, log in /tmp/serve.log. Settings come from .env (made from
# .env.example by postCreateCommand).
set -eu

cd "$(dirname "$0")/.."
exec just serve
