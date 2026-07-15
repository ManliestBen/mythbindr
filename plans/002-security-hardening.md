# Plan 002: Security hardening — required prod secret, session regeneration, rate limits, AI input caps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8d4cea7..HEAD -- apps/back/src/lib/env.ts apps/back/src/auth/routes.ts apps/back/src/index.ts apps/back/src/ai/routes.ts apps/back/package.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (001 recommended first so `npm test` exists)
- **Category**: security
- **Planned at**: commit `8d4cea7`, 2026-07-14

## Why this matters

Four independent hardening gaps, all small, all server-side (`apps/back`):

1. **Fail-open session secret.** If production boots without `SESSION_SECRET`, the app silently runs on a publicly-known literal — and that one value also derives the AES key for Spotify tokens at rest (`lib/crypto.ts:7`) and the Spotify OAuth `state` HMAC (`integrations/spotify/spotify.ts:28`). One misconfiguration makes session cookies forgeable (admin impersonation), stored tokens decryptable, and OAuth state forgeable, with no error to signal it.
2. **No session regeneration on login/register** — the pre-auth session id survives the privilege transition (fixation hardening gap).
3. **No rate limiting anywhere** — unauthenticated clients can hammer WebAuthn challenge generation and the public share endpoints unthrottled (this runs on a Raspberry Pi), and `login/verify` leaks a passkey-enumeration oracle via a distinct error message.
4. **AI endpoints accept up to the 5 MB body limit** into paid Claude API calls with no length caps and no rate limit — unbounded provider spend.

## Current state

Relevant files, each with its role:

- `apps/back/src/lib/env.ts` — env loading. Has a `required()` helper (lines 7–16) used for `MONGODB_URI`; `sessionSecret` falls back instead (line 23):

  ```ts
  mongodbUri: required('MONGODB_URI'),
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me',
  ```

  `nodeEnv` is available as `process.env.NODE_ENV ?? 'development'` (line 19) — note it's defined *inside* the same object literal, so a prod-only check must read `process.env.NODE_ENV` directly.

- `apps/back/src/auth/routes.ts` — WebAuthn (passkey) ceremonies via `@simplewebauthn/server`. Both verify handlers set `userId` on the pre-existing session:
  - register/verify (line 119–121):

    ```ts
    req.session.userId = String(user._id);
    req.session.currentChallenge = undefined;
    req.session.pendingRegistration = undefined;
    ```

  - login/verify (line 182–183):

    ```ts
    req.session.userId = String(credential.userId);
    req.session.currentChallenge = undefined;
    ```

  - login/verify's unknown-credential branch (lines 148–151) returns a distinct message:

    ```ts
    const credential = await Credential.findOne({ credentialID: req.body?.id });
    if (!credential) {
      return res.status(400).json({ error: 'Unrecognized passkey' });
    }
    ```

  All handlers are wrapped in `asyncHandler` (from `../auth/middleware`).

- `apps/back/src/index.ts` — app assembly. `app.set('trust proxy', 1)` is already applied in production (line 25–27; Cloudflare Tunnel + Caddy front the app). Middleware order: `cors` → `express.json({ limit: '5mb' })` → session → routes. Mounts (lines 42–52): `/api/auth`, `/api/share` (public, no auth), `/api/campaigns/:cid/ai` (scopedAiRoutes), `/api/ai` (globalAiRoutes), etc.

- `apps/back/src/ai/routes.ts` — three POST endpoints, all correctly gated `requireAdmin` server-side (do not change the gating). Input handling is hand-rolled with **no length caps**, e.g. `/refine` (lines 58–63):

  ```ts
  const text = String(req.body?.text ?? '');
  const action = String(req.body?.action ?? '').trim();
  if (!text || !action) { res.status(400).json({ error: 'text and action are required' }); return; }
  ```

  `/element` reads `req.body.type` (validated against `ELEMENT_TYPES`) and `req.body.prompt` (trimmed, non-empty). `/campaign` reads `req.body.prompt`.

- `apps/back/src/lib/validate.ts` — the repo's validation convention: a `validate(schema)` middleware that safeParses `req.body`, 400s with `issues` on failure, and replaces `req.body` with parsed data. Used by e.g. `sessions/routes.ts` (`validate(sessionStartSchema)`). Match this pattern.

- `apps/back/src/lib/session.ts` — `createSessionMiddleware()`; cookie is `mythbindr.sid`, `sameSite: 'lax'`, `secure` in prod. Also reused by Socket.IO (`realtime/io.ts:36`) — nothing here changes.

- `apps/back/package.json` — no rate-limit dependency exists.

Repo conventions: zod 4 (imported as `import { z } from 'zod'`), TypeScript strict, `asyncHandler` around all async route handlers.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install dep | `npm install --save express-rate-limit -w @mythbindr/back` (repo root) | exit 0 |
| Typecheck | `npm run typecheck`      | exit 0              |
| Tests     | `npm test` (if plan 001 landed) | all pass     |
| Build     | `npm run build`          | exit 0              |
| Manual smoke | `npm run dev:back` (needs `apps/back/.env`) | server boots |

## Scope

**In scope** (the only files you should modify/create):
- `apps/back/src/lib/env.ts`
- `apps/back/src/auth/routes.ts`
- `apps/back/src/index.ts`
- `apps/back/src/ai/routes.ts`
- `apps/back/package.json` + root `package-lock.json` (new dependency)
- `apps/back/.env.example` (one comment line, step 1)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `apps/back/src/lib/crypto.ts` and `integrations/spotify/spotify.ts` — they *consume* `sessionSecret`; requiring it at startup fixes them without edits.
- `apps/back/src/lib/session.ts` — cookie flags are already correct for the same-origin deploy.
- The `requireAdmin` gating on AI routes — verified correct; do not restructure.
- Security headers / helmet — deliberately rejected for now (Cloudflare/Caddy layer, see `plans/README.md`).
- Any frontend file. The frontend already surfaces 4xx error messages from the API.

## Git workflow

- One commit per step or one combined commit; style: short imperative summary (match `git log`, e.g. `Require SESSION_SECRET in production, add rate limits and AI input caps`).
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Require `SESSION_SECRET` in production

In `apps/back/src/lib/env.ts`, replace line 23:

```ts
sessionSecret: process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me',
```

with a prod-required form (checking `process.env.NODE_ENV` directly, since `env.nodeEnv` isn't initialized yet at that point in the literal):

```ts
sessionSecret:
  process.env.NODE_ENV === 'production'
    ? required('SESSION_SECRET')
    : process.env.SESSION_SECRET ?? 'dev-insecure-secret-change-me',
```

Also append one line to the Sessions section of `apps/back/.env.example`: `# REQUIRED in production — the server refuses to boot without it.`

**Verify**: `npm run typecheck` → exit 0. Then `NODE_ENV=production node -e "require('./apps/back/dist/lib/env.js')"` after `npm run build` → throws `Missing required environment variable: SESSION_SECRET` (expected failure proves the gate; MONGODB_URI may throw first if also unset — either required-var error is a pass).

### Step 2: Regenerate the session on register/verify and login/verify

In `apps/back/src/auth/routes.ts`, add one helper near the top of the file:

```ts
/** Rotate the session id across the login privilege boundary (fixation hardening). */
function regenerateSession(req: Parameters<RequestHandler>[0]): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve())),
  );
}
```

(Import `RequestHandler` from `express` if not already imported, or type the param as `express.Request` — match the file's existing imports.)

Then in **register/verify**, immediately before `req.session.userId = String(user._id);` (line 119), insert `await regenerateSession(req);`. The two `= undefined` lines after it can stay (they are no-ops on the fresh session but keep the diff minimal).

In **login/verify**, immediately before `req.session.userId = String(credential.userId);` (line 182), insert `await regenerateSession(req);`.

Important: regenerate **after** all reads of `req.session.currentChallenge` / `req.session.pendingRegistration` in those handlers (both handlers finish reading them well before these lines — confirm before editing).

**Verify**: `npm run typecheck` → exit 0. Manual smoke (optional but recommended): register or log in via the dev app and confirm the `mythbindr.sid` cookie **value changes** across the login call and the session works (user stays logged in after refresh).

### Step 3: Uniform login error (close the passkey-enumeration oracle)

In `apps/back/src/auth/routes.ts` lines 148–151, change the unknown-credential response body from `'Unrecognized passkey'` to `'Could not verify passkey'` — the same message as the failed-verification branch (line 175). Status stays 400.

**Verify**: `grep -n "Unrecognized passkey" apps/back/src/auth/routes.ts` → no matches.

### Step 4: Add rate limiting

Install: `npm install --save express-rate-limit -w @mythbindr/back` (run at repo root).

In `apps/back/src/index.ts`, after the session middleware (`app.use(createSessionMiddleware());`, line 31) and before the route mounts, add:

```ts
import { rateLimit } from 'express-rate-limit'; // top of file

// Strict bucket on unauthenticated surfaces; generous bucket on AI (paid API).
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: true, legacyHeaders: false });
const shareLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
const aiLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
```

Apply them at the mounts (edit the existing lines):

```ts
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/campaigns/:cid/ai', aiLimiter, scopedAiRoutes);
app.use('/api/ai', aiLimiter, globalAiRoutes);
app.use('/api/share', shareLimiter, shareRoutes); // public — no auth
```

Notes: `trust proxy` is already set to `1` in production (line 25–27), so the limiter keys on the real client IP behind Caddy/Cloudflare. express-rate-limit v7+ may log a warning about permissive trust proxy in dev — acceptable. Do not rate-limit the other routers.

**Verify**: `npm run typecheck` → exit 0. Then with the dev server running: `for i in $(seq 1 105); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/login/options; done | sort | uniq -c` → mostly `200`s then `429`s after 100.

### Step 5: Cap AI input sizes with the repo's `validate()` convention

In `apps/back/src/ai/routes.ts`:

1. Import: `import { z } from 'zod';` and `import { validate } from '../lib/validate';`
2. Define schemas near the top:

   ```ts
   const aiElementSchema = z.object({
     type: z.enum(ELEMENT_TYPES),
     prompt: z.string().trim().min(1, 'A brief is required').max(2000),
   });
   const aiRefineSchema = z.object({
     text: z.string().min(1).max(20_000),
     action: z.string().trim().min(1).max(200),
   });
   const aiCampaignSchema = z.object({
     prompt: z.string().trim().min(1, 'A premise is required').max(2000),
   });
   ```

3. Add `validate(aiElementSchema)` to the `/element` route's middleware chain (after `requireAdmin`), `validate(aiRefineSchema)` to `/refine`, `validate(aiCampaignSchema)` to `/campaign`.
4. Inside the handlers, replace the hand-rolled `String(req.body?...)` extraction and the manual `ELEMENT_TYPES.includes` / empty checks with direct reads of the now-validated body, e.g. for `/element`:

   ```ts
   const { type, prompt } = req.body as z.infer<typeof aiElementSchema>;
   ```

   Delete the now-dead manual 400 branches. Keep `ensureConfigured`, the try/catch around generator calls, and everything else unchanged.

**Verify**: `npm run typecheck` → exit 0. With dev server + an admin session cookie: `POST /api/campaigns/<cid>/ai/refine` with a 30,000-char `text` → 400 with zod issues (not a Claude API call). Without a valid admin session this endpoint returns 401/403 — that's fine; the 400-before-403 order doesn't matter, just confirm typecheck + the schema wiring compile.

## Test plan

If plan 001 has landed, add `apps/back/src/ai/routes.test.ts` is **not** feasible without HTTP scaffolding — instead add a pure schema test `apps/back/src/ai/schemas.test.ts` only if you exported the schemas; exporting them for tests is allowed. Cases: over-length `text` rejected; empty `action` rejected; valid payload passes. Model after `apps/back/src/campaigns/access.test.ts` (from plan 001). If plan 001 has not landed, skip tests; done criteria adjust accordingly.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm run typecheck` exits 0 and `npm run build` exits 0
- [ ] `grep -n "dev-insecure-secret-change-me" apps/back/src/lib/env.ts` shows the literal only on the non-production branch (still present for dev)
- [ ] `grep -c "regenerateSession(req)" apps/back/src/auth/routes.ts` prints `2`
- [ ] `grep -n "Unrecognized passkey" apps/back/src` returns no matches
- [ ] `grep -c "rateLimit" apps/back/src/index.ts` ≥ 4 (import + three limiters)
- [ ] `grep -n "max(2000)\|max(20_000)\|max(200)" apps/back/src/ai/routes.ts` shows all three caps
- [ ] `npm test` exits 0 (if plan 001 landed)
- [ ] `git status --porcelain` shows changes only to in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift).
- `req.session.regenerate` is undefined at runtime (would indicate a session-store/typing mismatch with `connect-mongo`) — report rather than hand-rolling session rotation.
- After Step 2, login stops persisting (cookie not set / user logged out on refresh) and one fix attempt fails — the regenerate/save ordering with `connect-mongo` needs human review.
- `express-rate-limit` install triggers an npm `ERESOLVE` conflict with the root `overrides.mongodb` pin.
- You find any AI route **without** `requireAdmin` — that violates a project rule (AI calls are admin-gated server-side); report it, don't just fix silently.

## Maintenance notes

- **Rotation caveat**: if any production instance ever booted without `SESSION_SECRET`, the fallback secret is burned — the operator should set a fresh secret (which invalidates sessions and stored Spotify tokens; users re-auth, Spotify re-links). Note this in the PR description.
- Rate-limit numbers are starting points; watch 429 rates in logs after deploy and tune.
- If Socket.IO endpoints ever need throttling, that's a separate mechanism (`io.use`), not express-rate-limit.
- The AI cap values (2000/20 000/200 chars) should track any future UI affordances (e.g. long-document refine would need a deliberate raise).
