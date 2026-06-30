# MythBindr (monorepo)

A TTRPG campaign companion: real-time co-editing, run-session tools, SRD
reference, Spotify mood slots, and AI assist.

## Layout

```
mythbindr/
├─ apps/
│  ├─ back/        # Express + MongoDB API (@mythbindr/back)
│  └─ front/       # Vite + React SPA   (@mythbindr/front)
├─ packages/
│  └─ shared/      # zod schemas + Socket.IO contract (@mythbindr/shared)
├─ docker-compose.yml   # api + web, both on the external `edge` network
└─ docs/deploy/         # Raspberry Pi + Cloudflare Tunnel + Caddy guides
```

`packages/shared` is the single source of truth for the API/client contract:
the zod element/campaign/session schemas (used by the API for validation and
available to the client for type derivation) and the typed Socket.IO event
contract (`ClientToServerEvents` / `ServerToClientEvents`, plus `Participant`
and the `toU8` binary helper) used by both the server and the browser.

## Develop

npm **workspaces** — install once from the root:

```bash
npm install
npm run build:shared        # build the shared package first (apps import its dist)
```

Run the two apps (separate terminals). The SPA proxies `/api` + `/socket.io` to
the API in dev (see `apps/front/vite.config.ts`), so the browser is single-origin:

```bash
npm run dev:back            # API on :4000  (needs apps/back/.env — copy apps/back/.env.example)
npm run dev:front           # SPA on :5173
```

> After editing `packages/shared`, re-run `npm run build:shared` so the apps pick
> up the new types/code (the apps consume its built `dist/`).

Typecheck / build everything:

```bash
npm run typecheck           # builds shared, then typechecks back + front
npm run build               # builds shared, back (tsc), and front (vite)
```

## Deploy

Production runs in Docker on a Raspberry Pi behind Cloudflare Tunnel + Caddy,
served same-origin at `https://mythbindr.benmanley.biz`:

```bash
docker network create edge          # once
docker compose up -d --build        # builds + runs api (mythbindr-api) and web (mythbindr-web)
```

Full instructions:
- [docs/deploy/raspberry-pi-setup.md](./docs/deploy/raspberry-pi-setup.md)
- [docs/deploy/cloudflare-caddy.md](./docs/deploy/cloudflare-caddy.md)

See [MIGRATION.md](./MIGRATION.md) for how this monorepo was assembled from the
former `mythbindr-back` / `mythbindr-front` repos and the remaining shared-type
dedup follow-ups.
