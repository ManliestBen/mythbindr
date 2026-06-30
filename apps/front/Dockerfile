# syntax=docker/dockerfile:1
#
# MythBindr web client — monorepo build. BUILD CONTEXT IS THE REPO ROOT.
# Produces a tiny static-file image (Caddy serving the Vite build) that the
# edge proxy routes to for everything except /api and /socket.io.

# ── Stage 1: build the SPA (needs @mythbindr/shared types) ──────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY . .
RUN npm ci \
 && npm run build:shared \
 && npm run build -w @mythbindr/front

# ── Stage 2: static runtime ─────────────────────────────────────────────────
FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/front/dist /usr/share/caddy
# SPA fallback: client-side routes (e.g. /campaigns/123) serve index.html.
RUN printf ':80 {\n\troot * /usr/share/caddy\n\ttry_files {path} /index.html\n\tfile_server\n}\n' \
    > /etc/caddy/Caddyfile
EXPOSE 80
