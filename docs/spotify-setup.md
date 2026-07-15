# Spotify integration setup

MythBindr can play mood-slot music from a GM's Spotify account during a
running session (`/api/integrations/spotify`). This is an **admin-only**
feature — only an admin user can connect Spotify, and the connect route
(`/login`) is gated behind `requireAdmin`. Everything is optional: the server
boots without any Spotify env vars set, and the integration routes return 503
until it's configured.

## Prerequisites

- A Spotify account with **Premium** — the Web Playback SDK (used to play
  audio in the browser) requires Premium; the OAuth flow itself works for any
  account, but playback will be limited without it.
- Access to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

## 1. Create a Spotify app

In the [Developer Dashboard](https://developer.spotify.com/dashboard), create
a new app. For dashboard UI specifics (fields, settings pages), Spotify's own
docs are the source of truth: see
[Spotify Web API — Apps](https://developer.spotify.com/documentation/web-api/concepts/apps).

You'll come away with:

- A **Client ID** and **Client Secret**. These are not a single API key —
  MythBindr needs both. The secret must stay server-side (`.env`, never
  committed, never sent to the browser).

## 2. Register a Redirect URI

In the app's settings, add a Redirect URI that exactly matches what the
server will send. For local development that's:

```
http://127.0.0.1:4000/api/integrations/spotify/callback
```

> **Use `127.0.0.1`, not `localhost`.** Spotify's authorization flow rejects
> `localhost` as a redirect host. This must be registered in the dashboard
> byte-for-byte, and `SPOTIFY_REDIRECT_URI` in `apps/back/.env` must match it
> byte-for-byte too — scheme, host, port, and path all count.

For production, the redirect URI is the server's public origin plus the same
callback path, e.g. `https://<your-domain>/api/integrations/spotify/callback`
— register that exact URL in the dashboard as well, and set
`SPOTIFY_REDIRECT_URI` to match in the production environment.

## 3. Set environment variables

In `apps/back/.env` (copy from `apps/back/.env.example`):

| Variable                  | Required | Notes                                                                 |
|----------------------------|----------|------------------------------------------------------------------------|
| `SPOTIFY_CLIENT_ID`        | to enable Spotify | From the app you created above.                              |
| `SPOTIFY_CLIENT_SECRET`    | to enable Spotify | Server-side only — never expose to the client.               |
| `SPOTIFY_REDIRECT_URI`     | to enable Spotify | Must byte-for-byte match a Redirect URI registered in the dashboard. Defaults to `http://127.0.0.1:4000/api/integrations/spotify/callback` for local dev. |

Until `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are both set, the server
treats Spotify as unconfigured and the integration routes respond `503`.

## How the connect flow works (for reference)

- `GET /api/integrations/spotify/login` (admin-only) redirects the GM to
  Spotify's consent screen with a signed `state` parameter — an HMAC over
  `SESSION_SECRET`, not a database-backed session — since the OAuth callback
  hits the backend directly and bypasses the Vite dev proxy (no session
  cookie on that request). Only an admin can mint a valid `state`, so the
  callback route itself doesn't need to re-check admin status.
- `GET /api/integrations/spotify/callback` exchanges the authorization code
  for tokens, fetches the Spotify profile, and stores the access/refresh
  tokens **encrypted at rest** on the user document.
- `GET /api/integrations/spotify/token` hands the browser a short-lived
  access token for the Web Playback SDK, refreshing via the stored refresh
  token when needed.
- `POST /api/integrations/spotify/disconnect` forgets the stored tokens.

## Troubleshooting

- **Redirect URI mismatch / `INVALID_CLIENT: Invalid redirect URI`** — the
  value Spotify received didn't byte-for-byte match a URI registered in the
  dashboard. Check scheme (`http` vs `https`), host (`127.0.0.1` vs
  `localhost` vs a domain), port, and trailing slashes on both sides.
- **`localhost` rejected** — switch to `127.0.0.1` for local development, in
  both the dashboard and `SPOTIFY_REDIRECT_URI`.
- **503 from any `/api/integrations/spotify/*` route** — `SPOTIFY_CLIENT_ID`
  or `SPOTIFY_CLIENT_SECRET` isn't set; the server considers the integration
  unconfigured.
- **Playback doesn't start** — confirm the connected Spotify account has
  Premium; the Web Playback SDK requires it.
