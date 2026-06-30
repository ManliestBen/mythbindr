# syntax=docker/dockerfile:1
#
# MythBindr API — monorepo build. BUILD CONTEXT IS THE REPO ROOT
# (docker-compose sets build.context: . and dockerfile: apps/back/Dockerfile),
# because the API depends on the @mythbindr/shared workspace package.
# Builds arm64 natively on a Raspberry Pi 5.

# ── Stage 1: install + build the whole workspace, then prune ────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Whole monorepo (node_modules/dist excluded via .dockerignore). The root
# package-lock.json drives a reproducible `npm ci` across all workspaces.
COPY . .
RUN npm ci \
 && npm run build:shared \
 && npm run build -w @mythbindr/back \
 && npm prune --omit=dev \
 && rm -rf apps/front apps/back/src packages/shared/src

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Copy the built, dev-pruned workspace. node_modules keeps the @mythbindr/shared
# symlink → packages/shared (which still has its package.json + dist).
COPY --chown=node:node --from=build /repo /repo

USER node
EXPOSE 4000

# `init: true` in compose forwards SIGTERM so the graceful-shutdown handler runs.
CMD ["node", "apps/back/dist/index.js"]
