# crowd-dj as a container (see README, "Running"). Mount a volume at /data for the database.
# Stage "dev" is the devcontainer, the last stage the app.
FROM node:26.12.1-trixie-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# adapter-node bundles the devDependencies; the dependencies (the native libsql client) stay in node_modules
RUN npm run build && npm prune --omit=dev

# Devcontainer: the same Node, git, user node (UID 1000), and Claude Code (native installer,
# updates itself). Its settings and sign-in live in ~/.claude, a volume mounted by
# devcontainer.json, so they survive rebuilds; the directory exists here so the new volume belongs
# to node. openssh-client: ssh-keygen for SSH-signed commits (through the forwarded agent).
FROM base AS dev
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && git config --system safe.directory '*'
USER node
RUN curl -fsSL https://claude.ai/install.sh | bash -s stable \
    && mkdir -p /home/node/.claude
ENV PATH=/home/node/.local/bin:$PATH CLAUDE_CONFIG_DIR=/home/node/.claude

FROM base
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/crowd-dj.db
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "build"]
