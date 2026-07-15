# Plan 012: Player live table view — `ShareLink.scope: 'session'` + read-only `/share` socket namespace

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 991460c..HEAD -- apps/back/src/models/ShareLink.ts apps/back/src/share apps/back/src/collab/routes.ts apps/back/src/realtime packages/shared/src/realtime apps/front/src/pages/SharePage.tsx apps/front/src/data/share.ts apps/front/src/App.tsx`
> Plans 009/010 touch the realtime dir and shared contract — expected. This
> plan requires 009 DONE (it consumes `session:state` broadcasts); 010 is
> beneficial but NOT required (the broadcast source is identical either way).
> Read `docs/design/live-session.md` §§ "Player view & share scope" and
> "Security considerations" first — every decision below is recorded there,
> including the operator's 2026-07-14 rulings.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED (a new unauthenticated realtime surface — the whitelist and namespace isolation are security boundaries)
- **Depends on**: plans/009 (DONE). Independent of 010/011.
- **Category**: direction (build)
- **Planned at**: commit `991460c`, 2026-07-14

## Why this matters

Players at the table have no view of initiative. The share-link system already gives unauthenticated visitors a whitelisted, read-only campaign view; this plan extends it with a `'session'` scope so one durable link per campaign shows a live, phones-friendly table view. Operator decisions (recorded in the design doc, 2026-07-14) that BIND this plan:

1. **Monster HP is hidden entirely** — players see no health signal of any kind for `isPlayer: false` combatants (no numbers, no tiers). PC HP is visible.
2. **The link follows the currently active session** — resolved at request time; no `sessionId` on `ShareLink`.
3. **One shared link for the whole party** — no per-player identity; `deathSaves` is never exposed on this path.
4. Abuse controls use the doc's placeholder numbers as **named constants**: max 10 concurrent sockets per token, IP-based handshake cooldown.

The authenticated `io.use` gate must not be weakened: share viewers connect to a **separate namespace** with its own token middleware and zero mutation handlers (structural enforcement — the design doc's core security decision).

## Current state (verify by reading — post-009 line numbers will differ)

- `apps/back/src/models/ShareLink.ts` — `scope: { type: String, enum: ['campaign'], default: 'campaign' }`, `token` (24-byte base64url, unique), `expiresAt`, `revoked`, `shareLinkIsLive(s)` helper (lines 3–24).
- `apps/back/src/collab/routes.ts:163-211` — owner-only share-link CRUD: `POST /share` creates (`crypto.randomBytes(24).toString('base64url')`), `GET /share` lists non-revoked, `DELETE /share/:linkId` sets `revoked: true`. `publicShareLink` returns `{ id, token, url, createdAt }` with `url = ${env.clientOrigin}/share/${s.token}`.
- `apps/back/src/share/routes.ts` — public REST: `resolve(token)` = `ShareLink.findOne({token})` + `shareLinkIsLive` + live campaign (lines 12–18). All responses go through `sharedElement` (whitelist).
- `apps/back/src/share/serialize.ts` — `sanitizeBody` + `GM_ONLY_DATA` + `sharedElement` whitelist; **plan 005's key-set test locks `sharedElement`'s output** — you are ADDING a sibling `sharedSession`, not touching `sharedElement`.
- `apps/back/src/realtime/io.ts` — `initRealtime(server)` creates the main authenticated namespace (`io.use` rejects userless connections). Post-009 it has `session:join` + `canAccessSession`. `getIO()` returns the `Server` — namespaces hang off it (`io.of('/share')`).
- `apps/back/src/realtime/sessionRooms.ts` (post-009) — `broadcastSessionState(s)` emits to `session:<sid>`. This plan adds a parallel emit of the FILTERED payload to the share room (Step 4).
- `apps/back/src/index.ts` — plan 002's `shareLimiter` covers `/api/share` HTTP only; socket handshakes need their own control (design doc).
- `apps/front/src/pages/SharePage.tsx` — the public campaign view at route `/share/:token` (lazy since plan 006). `apps/front/src/data/share.ts` — `useShareCampaign`/`useShareElements` hooks + owner-side link management; `ShareLinkT = { id, token, url, createdAt }`.
- `apps/front/src/App.tsx` — public route `<Route path="/share/:token" element={<SharePage />} />` outside `RequireAuth`; pages are `lazy()`.
- `apps/front/src/realtime/socket.ts` — main-namespace client socket. The share view must NOT use it (no cookie wanted): it creates its own namespace connection with `io('/share', { path: '/socket.io', auth: { token } })`.
- Settings UI for links: find it with `grep -rn "useCreateShareLink" apps/front/src` — that page needs a scope choice when creating.
- The shared contract (`packages/shared/src/realtime/events.ts`, post-009/010) — this plan adds SEPARATE interfaces for the share namespace (do not reuse `ClientToServerEvents`; the whole point is that the share namespace's contract has no mutation events).

## Commands you will need

| Purpose   | Command             | Expected on success |
|-----------|---------------------|---------------------|
| Build shared | `npm run build:shared` | exit 0 after every shared edit |
| Typecheck | `npm run typecheck` | exit 0              |
| Tests     | `npm test` (Node 24) | all pass           |
| Build     | `npm run build`     | exit 0              |

## Scope

**In scope** (the only files you should modify/create):
- `apps/back/src/models/ShareLink.ts` (scope enum + nothing else)
- `apps/back/src/collab/routes.ts` (create-with-scope; expose scope in `publicShareLink`)
- `apps/back/src/share/serialize.ts` (ADD `sharedSession` — do not modify `sharedElement`/`sanitizeBody`)
- `apps/back/src/share/serialize.test.ts` (extend with `sharedSession` cases)
- `apps/back/src/realtime/shareNamespace.ts` (create), `shareNamespace.test.ts` (create)
- `apps/back/src/realtime/io.ts` (one call to mount the namespace), `sessionRooms.ts` (parallel filtered broadcast)
- `packages/shared/src/realtime/events.ts` (share-namespace contract interfaces)
- `apps/front/src/pages/SharePage.tsx` (live-table tab/section), or a new `apps/front/src/pages/ShareSessionView.tsx` + route in `App.tsx` — executor's choice, document it
- `apps/front/src/data/share.ts` (scope on `ShareLinkT`; create accepts scope)
- The settings/members UI file that calls `useCreateShareLink` (scope picker)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch):
- `sharedElement` / `sanitizeBody` — locked by the key-set test; a failing serialize test means you broke scope.
- The main namespace's `io.use` or any main-namespace handler semantics.
- Ops/mutations of any kind on the share namespace — structurally absent, not permission-checked.
- Per-player identity, monster-HP tiers/toggles — operator explicitly decided against both.

## Git workflow

- Two commits, e.g. `Share scope 'session' + sharedSession whitelist` then `/share namespace + player live table view`.
- Do NOT push unless the operator instructed it.

## Steps

### Step 1: Schema + link management

`ShareLink.ts`: `enum: ['campaign', 'session']` (default `'campaign'` unchanged — non-breaking; the design doc records why). `collab/routes.ts`: `POST /share` accepts `{ scope? }`, validated to the enum (use the repo's `validate()` + a tiny zod schema, matching plan 002's convention), stored on create; `publicShareLink` gains `scope`, and for `'session'` links `url` points at the live view route you choose in Step 5 (e.g. `/share/${token}/session`). `data/share.ts`: `ShareLinkT` gains `scope: 'campaign' | 'session'`; `useCreateShareLink` passes it. Settings UI: a two-option picker on create ("Campaign lore" / "Live table view").

**Verify**: `npm run typecheck` → exit 0; `npm test` → all pass.

### Step 2: `sharedSession` whitelist in `serialize.ts`

Implement EXACTLY the doc's table + operator rulings:

```ts
/** Player-facing live-session serialization. Whitelist only — mirrors sharedElement's
 *  discipline. Monster HP is hidden ENTIRELY (operator decision 2026-07-14). */
export function sharedSession(s: /* GameSessionState-like or SessionDoc */) {
  return {
    round: s.round,
    turnIndex: s.turnIndex,
    status: s.status,
    combatants: (s.combatants ?? []).map((c) => ({
      cid: c.cid,
      name: c.name,
      initiative: c.initiative,
      isPlayer: c.isPlayer,
      conditions: (c.conditions ?? []).map((x) => ({ name: x.name, rounds: x.rounds ?? null })),
      ...(c.isPlayer
        ? { currentHp: c.currentHp, maxHp: c.maxHp, tempHp: c.tempHp }
        : {}),
    })),
    log: (s.log ?? [])
      .filter((l) => l.kind === 'roll' || l.kind === 'event') // notes are GM-only
      .map((l) => ({ at: l.at, kind: l.kind, text: l.text, by: l.by })),
  };
}
```

Never present: `deathSaves`, `notes`, `sourceElementId`, monster HP fields. Extend `serialize.test.ts` with a `sharedSession` block using the same exact-key-set style: monster combatant output keys are exactly `['cid','conditions','initiative','isPlayer','name']` (sorted); PC keys add the three HP fields; a `note` log entry is absent from output; `deathSaves`/`notes`/`sourceElementId` appear nowhere in `JSON.stringify` of the result.

**Verify**: `npx vitest run apps/back/src/share/serialize.test.ts` (Node 24) → all pass, including the untouched `sharedElement` cases.

### Step 3: Shared contract for the share namespace

In `events.ts`, add separate interfaces (deliberately NOT merged into the main ones):

```ts
/** /share namespace: read-only. There are NO client→server events besides the
 *  built-in connection handshake — the namespace registers no mutation handlers. */
export interface ShareServerToClientEvents {
  'session:state': (p: { seq: number; session: SharedSessionView }) => void;
  'session:none': () => void; // no active session for this campaign right now
}
export interface SharedSessionView { /* the sharedSession() return shape, typed */ }
```

**Verify**: `npm run build:shared`; `npm run typecheck` → exit 0.

### Step 4: The `/share` namespace — `apps/back/src/realtime/shareNamespace.ts`

```ts
export const MAX_SOCKETS_PER_TOKEN = 10;          // design doc placeholder, operator-confirmed
export const HANDSHAKE_COOLDOWN_MS = 2_000;       // per-IP minimum spacing between handshakes
```

- `initShareNamespace(io)` (called once from `initRealtime` after the main namespace is set up): `const nsp = io.of('/share')`.
- Middleware (`nsp.use`): read `socket.handshake.auth.token`; per-IP cooldown check (in-memory `Map<ip, lastAt>`; reject with a generic error, prune stale entries); resolve the token exactly like `share/routes.ts`'s `resolve()` **plus** `link.scope === 'session'`; enforce `MAX_SOCKETS_PER_TOKEN` by counting an in-memory `Map<token, Set<socketId>>`; on pass, stash `campaignId`+`token` on `socket.data` and register in the token index.
- On connection: join room `share:${campaignId}`; immediately send the current state — resolve `GameSession.findOne({ campaignId, status: 'active' })` (the "follows the active session" decision); emit `session:state` with `sharedSession(...)` or `session:none`. Register **no** other client-event handlers. On `disconnect`, remove from the token index.
- Broadcast fan-out: in `sessionRooms.ts`'s broadcast path, alongside the authenticated emit, also `io.of('/share').to(`share:${campaignId}`).emit('session:state', { seq, session: sharedSession(s) })` — the session doc/state carries `campaignId`; thread it through (the 009 `broadcastSessionState(s)` signature already receives the full doc). When a session ends, also emit the final state (status `'ended'` renders "session ended" client-side).
- **Revocation disconnects live sockets** (design doc security requirement): in `collab/routes.ts`'s `DELETE /share/:linkId` handler, after setting `revoked`, call an exported `disconnectShareToken(token)` that iterates the token index and `socket.disconnect(true)`s each. (Fetch the link doc before updating so you have the token.)

**Verify**: `npm run typecheck` → exit 0. Unit tests in `shareNamespace.test.ts` for the pure/mockable parts: cooldown map logic (same IP twice within window → reject; after window → pass); token cap (11th socket rejected); `disconnectShareToken` disconnects exactly the matching sockets (fake socket objects). Mock mongoose models per the `yElement.test.ts` pattern.

### Step 5: The player-facing page

Either extend `SharePage.tsx` with a "Live table" section when the link's scope is `session`, or add a lazy `ShareSessionView` page at `/share/:token/session` (and point `publicShareLink.url` at it) — pick one, document it. The view: connects with `io('/share', { path: '/socket.io', auth: { token } })` (a separate connection — do NOT reuse `getSocket()`); renders initiative order (sorted like the GM view — port or import the sort), highlights the acting combatant via `turnIndex`, shows PC HP bars, condition chips, and the filtered roll/event log; `session:none` renders a friendly "No session running — check back when the GM starts one"; socket `connect_error` (revoked/expired/cooldown) renders the same 404-style message the REST share page uses. Mobile-first layout (this is explicitly a phones feature); match SharePage's styling.

The REST `GET /api/share/:token` already returns `{ campaign: { name }, valid }` for any live link — reuse it for the page header; if the link's scope must be exposed to the client for routing, add `scope` to that response (safe: it leaks nothing).

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0 (new page must be a lazy chunk — check `apps/front/dist/assets` gains a chunk and the entry doesn't grow).

### Step 6: Manual acceptance (needs `apps/back/.env`; if unavailable, SKIP and say so — reviewer/operator runs it)

Create a `session`-scoped link as owner; open it in an incognito window (no cookies): live view appears; GM damages a monster → player view updates < 1 s and shows NO monster HP anywhere (DOM inspect, not just visually); GM adds a `note` log entry → absent from player log; revoke the link → the incognito socket disconnects and the page shows the invalid-link state without a refresh; 11th concurrent connection on one token is rejected.

## Test plan

- `serialize.test.ts` additions (Step 2) — the security boundary; exact-key-set style, mandatory.
- `shareNamespace.test.ts` (Step 4) — cooldown, cap, revocation-disconnect.
- Full suite green. The socket handshake middleware end-to-end is manual (Step 6).

## Done criteria

- [ ] `npm run typecheck`, `npm run build`, `npm test` (Node 24) all exit 0
- [ ] `grep -n "'campaign', 'session'" apps/back/src/models/ShareLink.ts` matches
- [ ] `grep -n "sharedSession" apps/back/src/share/serialize.ts` matches and `git diff 991460c..HEAD -- apps/back/src/share/serialize.ts` shows `sharedElement`/`sanitizeBody` UNCHANGED
- [ ] `grep -c "deathSaves\|notes\|sourceElementId" <(node -e "console.log(require('fs').readFileSync('apps/back/src/share/serialize.ts','utf8').split('sharedSession')[1])")` → 0 (none of the GM-only fields appear in the new serializer; simpler: read it and cite)
- [ ] `grep -n "MAX_SOCKETS_PER_TOKEN = 10" apps/back/src/realtime/shareNamespace.ts` matches
- [ ] `grep -rn "session:applyDamage\|session:nextTurn" apps/back/src/realtime/shareNamespace.ts` → no matches (no mutation handlers, structurally)
- [ ] `grep -n "disconnectShareToken" apps/back/src/collab/routes.ts` matches
- [ ] serialize.test.ts contains a sorted-key-set assertion for the monster combatant shape
- [ ] `git status --porcelain` clean; only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 009 is not DONE in the index.
- Adding the namespace requires ANY change to the main namespace's `io.use` or its handlers beyond the one `initShareNamespace(io)` call — that is the design's red line.
- The typed-Server generics fight the second namespace's different event maps in a way that pressures you to merge the contracts — merged contracts would give the share namespace compile-visible mutation events; report instead.
- `broadcastSessionState` doesn't have access to `campaignId` at the share-broadcast point (post-010 refactors may have changed its input) — report the actual signature rather than re-querying per broadcast without noting the cost.
- Any test in the pre-existing `serialize.test.ts` fails — you touched the locked boundary.

## Maintenance notes

- `sharedSession` is now the second whitelist in `serialize.ts` — future `Combatant` fields are hidden from players by default; a reviewer of any combatant-schema change should expect the key-set tests to force a conscious decision.
- The cooldown/cap maps are in-memory per-process — fine for the single-Pi deploy; a multi-instance future needs shared state (note, don't build).
- If the operator later wants monster-HP tiers or per-player identity, both were explicitly decided AGAINST on 2026-07-14 — reopen the decision in `docs/design/live-session.md` first, don't slip it into a PR.
