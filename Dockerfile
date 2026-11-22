# crowd-dj as a container (see README, "Setting it up"). Stage "dev" is the devcontainer, the last
# stage "app" the image that runs the app (the default target). Mount a volume at /data for the
# database.
FROM node:26.13.0-trixie-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false

# The production build: adapter-node bundles the devDependencies into build/; the dependencies (the
# native libsql client) stay in node_modules
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build \
    && npm prune --omit=dev

# Devcontainer: the same Node with user dev (UID 1000; the image's user node renamed). Claude Code,
# git, just and dev-kit come from the dev-kit feature (.devcontainer/devcontainer.json).
FROM base AS dev
RUN usermod --login dev --move-home --home /home/dev node \
    && groupmod --new-name dev node
USER dev

# The app: user crowd-dj (UID 1000), the database in /data. VERSION labels the image when a build
# sets it (CI); the app itself reports the version from package.json at /healthz.
FROM base AS app
ARG VERSION=dev
LABEL org.opencontainers.image.title=crowd-dj \
    org.opencontainers.image.source=https://github.com/KebapBoy/crowd-dj \
    org.opencontainers.image.version=$VERSION
RUN usermod --login crowd-dj --home /nonexistent node \
    && groupmod --new-name crowd-dj node \
    && mkdir /data \
    && chown crowd-dj:crowd-dj /data
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/crowd-dj.db
USER crowd-dj
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "build"]
