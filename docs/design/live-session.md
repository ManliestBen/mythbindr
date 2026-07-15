# Design spike: live shared session table over the existing Socket.IO contract

- **Plan**: `plans/008-live-session-spike.md`
- **Status**: proposed — not yet reviewed by the operator. No production code changed.
- **Scope of this doc**: architecture decision + event contract + player-view design for
  broadcasting `RunSession` state over the existing Socket.IO layer, and a `ShareLink.scope:
  'session'` read-only player view. This spike decomposes the work into build plans; it does
  not implement any of them.

Verified against the repo at HEAD after merging `worktree-agent-a2f7e6a0f9d989779` (plan 002,
security hardening), `worktree-agent-a5c5ab7f3fc5d36fa` (plan 003, combat tracker fixes), and
`worktree-agent-a1536717654e09f34` (plan 004, Yjs collab fixes). Confirmed by reading files at
that commit — no session-related socket events exist today (`packages/shared/src/realtime/events.ts`
defines only `element:join/leave` and `yjs:*`), so this design starts from a clean slate rather
than reconciling with an existing implementation.

## Problem

`RunSession` (initiative order, HP, conditions, the roll/note log — the GM's at-the-table
screen, `apps/front/src/pages/RunSession.tsx`) persists over plain REST: local edits go into
React state immediately, then an 800 ms debounce (`persist()`, lines 89–117) fires a wholesale
`PATCH /api/campaigns/:cid/session/:sid` that replaces `round`/`turnIndex`/`combatants`/`log`
(`apps/back/src/sessions/routes.ts` lines 62–87). Plan 003 added a `dirty` flag so the UI can
show "Saving…" honestly, and a flush-on-end so ending a session doesn't drop the last debounce
window (`finishSession`, lines 272–289) — but the sync model itself is unchanged: **other
open tabs/devices only see the GM's edits when they refetch**, which happens on remount or
after the query's 30 s staleTime, not on a schedule useful at the table.

Meanwhile the app already runs a typed, authenticated Socket.IO layer for element co-editing
(`apps/back/src/realtime/io.ts`, contract in `packages/shared/src/realtime/events.ts`): session-
cookie auth reused on the socket engine, per-room membership+role checks
(`canAccessElement`), and a presence broadcast. Extending that contract to relay session state
is a comparatively small lift and turns a GM-only screen into a table-wide, near-real-time one.
Separately, `ShareLink.scope` (`apps/back/src/models/ShareLink.ts`) is currently a single-value
enum (`'campaign'`) that only serves static, whitelisted element data
(`apps/back/src/share/serialize.ts`, `apps/back/src/share/routes.ts`) to unauthenticated
holders of a 24-byte token. A `'session'` scope could give players a live, read-only
initiative/HP view on their own phones with no account — but that requires unauthenticated
sockets, which the current `io.use` middleware explicitly rejects (`apps/back/src/realtime/io.ts`
lines 41–48: `if (!userId) next(new Error('unauthorized'))`).

This spike answers, before any build plan is written: (1) who owns the authoritative session
state once more than one client can mutate it, (2) what the wire contract looks like, (3) how
an unauthenticated share-link viewer gets a socket at all without weakening `io.use`, and (4)
how socket-delivered state coexists with the existing React Query cache.

## State authority decision

Three options were on the table:

- **A. GM-authoritative broadcast** — any client with `editor` role mutates locally and PATCHes
  as today; the server additionally relays the *resulting* document (or the raw patch) to the
  session room over the socket. Smallest delta from today. Conflict shape is unchanged:
  two editors racing still get last-writer-wins with an 800 ms window, just now both writers
  and viewers see it sooner.
- **B. Server-authoritative state** — the server holds the live `GameSession` as in-memory
  state per room (directly analogous to a `yElement.ts` `Room`: `doc` → `state`, `dirty` flag,
  `saveTimer`, `ready` hydration promise). Clients no longer PATCH directly; they emit named
  *operations* (`session:nextTurn`, `session:applyDamage`, …). The server applies the operation
  to its held state, broadcasts the new state (or a diff) to the room, and persists on the same
  debounce/dirty pattern `yElement.ts` already uses. Eliminates the 800 ms clobber window
  because there is exactly one place operations are applied, in receipt order.
- **C. CRDT (Yjs) for session state** — reuse the Yjs machinery already in the codebase,
  modeling `round`/`turnIndex`/`combatants`/`log` as a shared Y.Map/Y.Array.

**Recommendation: B, server-authoritative state**, phased in from A.

Why not A: it is cheap but doesn't solve the actual problem stated in the plan's rationale —
"the state-authority question... has real design tension with the existing debounced-REST
persistence." Broadcasting PATCH results is presentation-only; two GMs (or a GM and a co-DM
editor) racing on the same combatant still silently clobber each other, just faster and more
visibly. It's a reasonable *first shippable slice* but not the end state, so it's folded into
the migration path below rather than rejected outright.

Why not C: turn order, HP, and the round counter are a small, well-understood state machine
with a handful of named transitions (advance turn, apply damage, add/remove combatant, append
log entry). A CRDT buys automatic merge of concurrent edits to *the same field*, which this
domain doesn't want — "player HP after two simultaneous damage events" should be `sum of both`,
not a last-write-wins register merge or manual conflict UI, and turn-order mutations are not
independent/commutative the way rich text is. Yjs's actual strength (offline-friendly merge of
freeform structural edits) doesn't map onto a strictly turn-ordered state machine with server-
side game rules (e.g., "advancing past a combatant with 0 HP and no death saves" is domain
logic, not a text-merge problem). CRDT machinery would be paid for and mostly unused. Rejected.

Why B over "just A forever": the plan explicitly names conflict resolution as the crux, and the
codebase already has the pattern in production (`yElement.ts`'s `Room` type: held document +
`dirty` + debounced persist + `ready` hydration gate for the first joiner). Reusing that shape
means the socket layer for sessions is not a novel design, it's the second application of an
established one — lower review risk than inventing a new concurrency model.

**Migration path from today's PATCH flow:**

1. **Slice 1 (ships value fast, is store-and-forget-safe):** Add the socket room and a
   `session:state` broadcast that fires whenever the existing PATCH handler successfully
   writes (server-side, inside the route handler, not a new client codepath) — this is
   option A, and it requires zero changes to `RunSession.tsx`'s edit model. Ships "other tabs
   see GM edits live" with the smallest diff. Explicitly a stepping stone, not the design's
   end state — call this out in the build plan so it isn't mistaken for "done."
2. **Slice 2:** Introduce the operation events (`session:nextTurn`, `session:applyDamage`,
   `session:updateCombatant`, `session:appendLog`, …) alongside the PATCH route (both live
   briefly; the route becomes legacy/cold-load-only). Move state ownership into a per-room
   in-memory holder in the back end, mirroring `yElement.ts`'s `Room`/`joinRoom`/`applyUpdate`/
   `scheduleSave` shape almost line for line (state object instead of `Y.Doc`, an `apply(op)`
   reducer instead of `Y.applyUpdate`).
3. **Slice 3:** `RunSession.tsx`'s `patch()`/`persist()` callback is replaced by dispatching
   operations over the socket instead of computing next-state locally and debouncing a PATCH.
   The 800 ms debounce and `dirty` flag move server-side (already true of `yElement.ts`); the
   client's own dirty indicator becomes "operation acked" instead of "PATCH settled" (see Cache
   reconciliation below for exactly how this interacts with `useUpdateSession`).
4. Retire the wholesale PATCH route down to being the cold-load path only (already true — `GET
   /session` stays as is for initial load and page refresh); keep it as a fallback for clients
   that never open a socket (e.g., a very brief offline window), but no longer as the live-edit
   path.

## Event contract

Additions to `packages/shared/src/realtime/events.ts` (drafted here, not committed as code —
per Scope, no shared-contract file is edited in this spike):

```ts
// ── Session live-state (combat tracker) ────────────────────────────────────

/** Envelope identifying which session room an event targets. */
export interface SessionRef {
  sessionId: string;
}

/** The full server-held session document, as broadcast on join and after every op. */
export interface SessionStatePayload extends SessionRef {
  round: number;
  turnIndex: number;
  combatants: Combatant[]; // reuse apps/front/src/data/session.ts's Combatant shape
  log: LogEntry[];         // reuse apps/front/src/data/session.ts's LogEntry shape
  status: 'active' | 'ended';
  /** Monotonic per-room op counter; lets a client detect it missed a broadcast
   *  (e.g. reconnect) and should re-request `session:join` rather than trust
   *  a stale local copy. */
  seq: number;
}

/** Table-side "who is watching" — reuses the existing Participant shape (io.ts's
 *  emitPresence already dedups by userId); no new payload type needed, but it is
 *  emitted to the `session:<sid>` room under the existing `presence` event name. */

// Individual operations. Each is small and named for the game action it represents,
// not a generic "patch" — this is what buys the server the ability to apply real
// combat-tracker semantics (e.g. clamping HP, expiring conditions) in one place
// instead of trusting whatever shape of partial object a client PATCHed.

export interface NextTurnOp extends SessionRef {}
export interface PrevTurnOp extends SessionRef {}

export interface ApplyDamageOp extends SessionRef {
  cid: string;         // Combatant.cid
  amount: number;      // positive = damage, negative = healing; tempHp absorbs first
}

export interface UpdateCombatantOp extends SessionRef {
  cid: string;
  patch: Partial<Combatant>; // e.g. { conditions, notes, initiative } — never cid
}

export interface AddCombatantOp extends SessionRef {
  combatant: Combatant;
}

export interface RemoveCombatantOp extends SessionRef {
  cid: string;
}

export interface AppendLogOp extends SessionRef {
  kind: 'roll' | 'note' | 'event';
  text: string;
}

export interface EndSessionOp extends SessionRef {}

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  // ...existing element:*/yjs:* entries unchanged...
  'session:join': (p: SessionRef) => void;
  'session:leave': (p: SessionRef) => void;
  'session:nextTurn': (p: NextTurnOp) => void;
  'session:prevTurn': (p: PrevTurnOp) => void;
  'session:applyDamage': (p: ApplyDamageOp) => void;
  'session:updateCombatant': (p: UpdateCombatantOp) => void;
  'session:addCombatant': (p: AddCombatantOp) => void;
  'session:removeCombatant': (p: RemoveCombatantOp) => void;
  'session:appendLog': (p: AppendLogOp) => void;
  'session:end': (p: EndSessionOp) => void;
}

/** Events the server emits to the browser. */
export interface ServerToClientEvents {
  // ...existing presence/yjs:* entries unchanged...
  'session:state': (p: SessionStatePayload) => void;
  /** Emitted instead of session:state when an op is rejected (bad cid, session
   *  already ended, unauthorized) — lets the client roll back an optimistic
   *  local change without guessing from a missing broadcast. */
  'session:opError': (p: SessionRef & { message: string }) => void;
}
```

Rooms use the existing naming convention: `session:<sessionId>` (parallel to `el:<elementId>`
and `y:<elementId>` in `io.ts`). Auth on join mirrors `element:join`'s `canAccessElement`
pattern: resolve `sessionId` → `campaignId` (a `GameSession.findById(sessionId).select
('campaignId')` analogous to the existing `Element.findById(elementId).select('campaignId')`),
then `Membership.findOne({ campaignId, userId })` with `roleAtLeast(role, 'viewer')` — anyone
who can see the campaign can watch the table; `'editor'`/`'owner'` is required for every
mutating op (checked per-op, not just at join, since a demoted membership shouldn't retain
write access for the rest of the socket's lifetime).

## Player view & share scope

**Schema change (design only — not applied in this spike):** `ShareLink.scope` gains
`'session'`:

```ts
scope: { type: String, enum: ['campaign', 'session'], default: 'campaign' },
```

This is non-breaking: existing documents have no `scope` value stored unless explicitly set
(default `'campaign'`), and Mongoose enum validation only runs on write, so old rows read back
as `'campaign'` via the schema default with no migration required. A `'session'`-scoped link
would additionally need a pointer to which session it grants access to — either a
`sessionId` field on `ShareLink` (nullable, only set for scope `'session'`) or, if a share link
should always follow "whatever session is currently active" for the campaign, resolve it at
request time the same way `GET /session` does (`GameSession.findOne({ campaignId, status:
'active' })`). The latter is recommended: it matches how the GM already thinks about the link
("give players the table view", not "give players *this specific* session"), and avoids a
share link silently going dead when a session ends and a new one starts.

**Unauthenticated socket access — the core design question.** Today's `io.use` middleware
hard-rejects any connection without a session-cookie `userId` (`apps/back/src/realtime/io.ts`
lines 41–48). A share-link viewer has no account and no cookie, so they cannot pass that gate as
written. Two ways to reconcile this were considered:

- Loosen `io.use` to admit userless connections and push the auth decision downstream to each
  event handler. **Rejected** — this is exactly the tension the plan told this spike to
  surface rather than paper over: `io.use` is the single choke point that guarantees *every*
  handler in `io.ts` (`element:*`, `yjs:*`, and any future authenticated event) runs with a
  known `userId` in `socket.data`/`session.userId`. Weakening it means every existing and
  future handler must re-verify "do I actually have a user?" instead of relying on the
  connection-level invariant, and a single missed check anywhere in that file becomes an
  auth bypass. That risk is disproportionate to the feature.
- **Recommended instead: a second, separate Socket.IO namespace, `/share`,** with its own
  `io.of('/share').use(...)` middleware that validates a share token carried in the connection
  `auth` payload (`io(url, { auth: { token } })` — no cookie involved) via `shareLinkIsLive`,
  exactly as `apps/back/src/share/routes.ts`'s `resolve()` already does for REST. This
  namespace:
  - Never touches `io.use` or the main namespace's socket handlers — the authenticated gate
    stays exactly as strict as it is today, satisfying the "must NOT lose" requirement.
  - Only ever joins `session:<sid>` rooms (read path) and only ever receives `session:state`
    and `presence`-shaped broadcasts (participant list without `userId`, or omitted entirely —
    see below) — it registers zero `ClientToServerEvents` mutation handlers, so there's no
    code path by which an unauthenticated socket can reach `session:applyDamage` etc. This is
    enforced structurally (the namespace's own handler registration simply doesn't include
    those listeners), not by a per-event permission check that could be forgotten.
  - Re-validates `shareLinkIsLive` and expiry on every join (tokens can be revoked mid-session;
    a live socket connection must not outlive a revoked link — on revocation the server should
    also proactively `disconnect()` any sockets already joined under that token, which requires
    tracking token→socket similar to how `yrooms`/`sockets` sets are tracked per room today).

**Player-facing state whitelist.** Mirroring `serialize.ts`'s whitelist discipline (never
"blacklist the sensitive fields," always "list exactly what's allowed"), the `/share` namespace
must receive a *separately serialized* payload, not the same `SessionStatePayload` sent to
authenticated members. Proposed `sharedSessionState()`:

| Field | Player sees? | Notes |
|---|---|---|
| `round`, `turnIndex` | yes | needed to show whose turn it is |
| `status` | yes | so the view can say "session ended" |
| `combatants[].cid` | yes | stable key for React lists |
| `combatants[].name` | yes | |
| `combatants[].initiative` | yes | needed for turn order display |
| `combatants[].isPlayer` | yes | lets the UI visually separate PCs from monsters |
| `combatants[].conditions` | yes | table generally wants to see status effects |
| `combatants[].currentHp`, `maxHp`, `tempHp` | **operator-configurable, default no for `isPlayer: false`** | see open question below |
| `combatants[].deathSaves` | yes, but **only for the viewer's own PC** if per-player identity is ever added; for now (no per-player login) treat as GM-only and omit | conservative default until share links can be scoped to a specific player |
| `combatants[].notes` | **no** | GM scratch notes ("secretly a doppelganger") — this is exactly the class of field `serialize.ts`'s `GM_ONLY_DATA` pattern exists to strip |
| `combatants[].sourceElementId` | **no** | leaks internal element ids, same rationale as `sanitizeBody`'s mention-stripping in `serialize.ts` |
| `log` | **filtered**: `kind: 'roll'` and `kind: 'event'` yes; `kind: 'note'` **no** | GM notes typed into the roll log during play are GM-only by the same logic as `notes` |

This whitelist function lives next to `sharedElement()` in `apps/back/src/share/serialize.ts`
(or a sibling `sharedSession()` in the same file) so the "whitelist, not blacklist" discipline
and its rationale stay in one reviewed place, and both share-scope kinds are audited together.

**Rate/abuse posture.** Plan 002's HTTP rate limiting (`authLimiter`/`shareLimiter`/`aiLimiter`
in `apps/back/src/index.ts`) covers only `/api/auth`, `/api/share`, `/api/ai` — it does not, and
cannot, cover a persistent socket namespace. The `/share` namespace needs its own controls:
- Per-token connection cap (e.g. reject a new connection for a token that already has N active
  sockets — table size is small, so N≈10 is generous and catches a leaked/scraped token being
  hammered).
- Reuse `express-rate-limit`-style limiting is impossible for handshakes over an existing pool,
  but the handshake middleware runs on plain HTTP upgrade requests, so a lightweight in-memory
  rate limit *by IP* on the `/share` namespace's `.use()` handshake step (reject with a
  cooldown, not a hard ban) is comparable in spirit to `shareLimiter`, checked at connect time.
- No mutation handlers registered on `/share` at all (see above) removes the largest abuse
  surface by construction — there is no "spam damage events" vector to rate-limit because that
  event doesn't exist on this namespace.
- Log/alert (not just silently drop) repeated failed token validations on `/share`, mirroring
  how a revoked/expired token is already a 404 on the REST share routes — this is monitoring,
  not a new mechanism, but should be called out in the build plan since sockets don't show up
  in HTTP access logs the same way.

## Cache reconciliation

`apps/front/src/data/session.ts`'s `useSession(cid)` reads `['campaign', cid, 'session']` from
the React Query cache; `useUpdateSession`'s `onSuccess` writes the PATCH response straight into
that same key (`qc.setQueryData(key(cid), session)`) specifically so the cache doesn't go stale
between saves. The socket layer needs to write into the exact same cache key so `RunSession.tsx`
doesn't need two sources of truth for `session`.

Design:
- A `session:state` handler (registered once per mounted `RunSession`, alongside the existing
  `useSession` call) does `qc.setQueryData(['campaign', cid, 'session'], (prev) => ({ ...prev,
  ...payload }))` on every broadcast — same mechanism `useUpdateSession.onSuccess` already
  uses, just triggered by the socket instead of by the local mutation's own response.
- Once Slice 3 lands (operations dispatched over the socket instead of local `patch()` +
  debounced PATCH), `useUpdateSession`'s `mutationFn` goes away for live edits; `RunSession.tsx`
  calls `socket.emit('session:applyDamage', {...})` etc. directly. `useSession`'s `useQuery`
  remains as the cold-load path (first mount, refresh, socket reconnect after a network blip)
  and the source of the initial `session` state before any socket event has arrived — this
  mirrors `yElement.ts`'s `ready` hydration promise: the socket path doesn't have live state
  to offer until the join round-trip completes, so the REST-loaded snapshot is what's on
  screen in the meantime, exactly as the Yjs editor shows the last-saved doc before `yjs:init`.
- **Local optimism vs. server-authoritative state (the actual behavior change plan 003's dirty
  flag needs to account for):** today `RunSession.tsx` mutates its own local `session` state
  synchronously (`patch()`), then debounces persistence — the UI is instant by construction.
  Under Slice 2/3, the server is the sole applier of operations, so a client cannot know an op
  "took" until `session:state` (or `session:opError`) comes back. Two sub-options:
  - *Naive*: wait for the round-trip before updating UI. Simplest, but on a slow connection
    the "Next turn" button would visibly lag — worse table-side UX than today.
  - *Recommended*: keep local optimistic apply (compute the same next-state the server would,
    show it immediately) but treat it as provisional until `session:state` confirms it —
    reconcile by replacing local state with the server's `seq`-numbered payload whenever one
    arrives, and surface `session:opError` as a rollback + toast ("your last change didn't
    save — [reason]"). This is a bigger client change than Slice 1/2 and should be its own
    build-plan line item, not bundled into the socket-plumbing plan.
- **Dirty-flag / SaveStatus indicator (plan 003):** its semantics change meaning under the new
  model. Today `dirty` means "there's an unflushed local edit sitting in the 800 ms debounce
  window." Under server-authoritative state there is no client-side debounce for the live path
  at all (persistence-to-Mongo debouncing moves server-side, invisible to the client, matching
  `yElement.ts`'s `dirty`/`scheduleSave`). `SaveStatus` should be redefined as "operation
  acknowledged by the server" (pending = op sent, no `session:state`/`session:opError` for it
  yet; error = `session:opError` received) rather than "PATCH settled" — same three-state UI
  (`Saving… / Saved / Not saved`), different underlying signal. This is a small, mechanical
  change to `RunSession.tsx`'s `persist`/`patch` callbacks once Slice 3 lands, but should be
  flagged explicitly in that build plan since it's easy to leave the old debounce-based
  `dirty` logic in place by accident and end up with two independent "is it saved" signals.
- `useSessionHistory` (ended sessions) is untouched — it only ever reads terminal, immutable
  session snapshots and has no live-update requirement.

## Security considerations

- **`io.use`'s authenticated invariant must not weaken.** Addressed structurally above: the
  share-link viewer path is a separate namespace with its own middleware and zero mutation
  handlers, not a loosened check on the main namespace. This is the STOP condition called out
  in the plan ("the share-link socket design cannot avoid weakening the authenticated `io.use`
  path — surface the tension") and it does not trigger: the two paths never share a middleware
  or a handler registration, so there's nothing to weaken.
- **Per-op authorization, not just per-join.** `element:join`'s `canAccessElement` check runs
  once, at join time, and afterward `yjs:update`/`yjs:awareness` handlers only check room
  membership (`yrooms.has(elementId)`), not role, because Yjs co-editing already implies
  editor access was checked at `yjs:join`. Session mutation ops are higher-stakes (they can
  end a session, delete a combatant, or zero someone's HP) and a membership's role can change
  mid-connection (an owner could demote a co-DM to viewer mid-session), so each mutating
  `session:*` event handler should re-check `roleAtLeast(role, 'editor')` at call time, not
  rely on a join-time check the way `yjs:update` does. This is a deliberate deviation from the
  yElement.ts pattern, called out so a future implementer doesn't "reuse the yjs shape" here
  by accident and skip it.
- **Share-token revocation must actively disconnect live sockets**, not just reject future
  joins — a token could be revoked specifically because it leaked, and a live socket connection
  from that leak should be cut, not merely prevented from reconnecting. Requires a token→socket
  index (parallel to the existing room `sockets: Set<string>` bookkeeping in `yElement.ts`).
  Flagging this now because it's easy to ship "revocation blocks new joins" and consider the
  feature done, leaving an already-connected leaked-token holder watching the table live
  indefinitely.
- **`session:opError` must never leak more than the whitelist allows** — e.g. an "unauthorized"
  rejection message should not accidentally echo back the attempted payload if that payload
  could contain fields the requester isn't privileged to see. Keep rejection messages generic
  ("could not apply that change") rather than descriptive of internal state.
- **CORS/origin**: the `/share` namespace should reuse `initRealtime`'s existing `cors: {
  origin: env.clientOrigin, credentials: true }` config for its own namespace's handshake, but
  note `credentials: true` is meaningless for the share namespace since there's no cookie —
  worth double-checking the socket.io namespace-level CORS override doesn't need
  `credentials: false` there to avoid a confusing mismatch (implementation-detail flag, not a
  vulnerability).

## Build plan sketch

1. **Plan A — Session room + Slice-1 broadcast**: add `session:join/leave`, wire
   `session:state` to fire from the existing PATCH/end handlers, add the presence reuse for
   "who's watching the table." No client mutation-model change. (Depends on: nothing new.)
2. **Plan B — Server-held session state + operation events**: move state ownership into a
   `yElement.ts`-shaped in-memory room (`Room` → session state, `dirty`/`scheduleSave`/`ready`
   hydration), implement the `session:nextTurn/applyDamage/updateCombatant/addCombatant/
   removeCombatant/appendLog/end` handlers server-side with per-op role checks, retire the
   PATCH route to cold-load-only. (Depends on: Plan A's room plumbing.)
3. **Plan C — Client migration to operation dispatch + optimistic reconciliation**: replace
   `RunSession.tsx`'s local `patch()`/`persist()` with socket-emitted ops, optimistic-apply +
   `seq`-based reconciliation, redefine `SaveStatus`/`dirty` around op-ack instead of
   PATCH-settle. (Depends on: Plan B's event contract being live.)
4. **Plan D — `ShareLink.scope: 'session'` + `/share` player view**: schema enum addition,
   `/share` namespace with token-handshake auth, `sharedSession()` whitelist in `serialize.ts`,
   token-revocation-disconnects-sockets, per-token connection cap, a minimal read-only front-end
   route for share-link holders. (Depends on: Plan A or B for `session:state` to relay; does
   not depend on Plan C.)

## Open questions for the operator

1. **Monster HP visibility for players** — exact numbers, a descriptive tier ("bloodied" /
   "near death"), or hidden entirely? This is a GM table-culture preference with no clearly
   correct default; recommend making it a per-campaign (or per-share-link) toggle rather than
   hard-coding one policy, but the *default* needs an operator decision before Plan D ships.
2. **Does a `'session'`-scoped share link always follow "whichever session is currently
   active," or should it pin to one specific session at creation time?** Recommended above:
   follow the active session. Confirm that matches how GMs actually use share links today (are
   they typically regenerated per-session, or handed out once and reused indefinitely?).
3. **Per-player identity on the share view** — is a `'session'` share link one shared link for
   the whole party (current recommendation, simplest), or does the design need to eventually
   distinguish "which PC is this viewer" (e.g. to show that player's own death saves, or to
   let them self-report HP)? Affects whether `deathSaves`/per-PC private fields are ever
   exposed via this path at all.
4. **Slice 1 as a shippable milestone, or skip straight to Plan B?** Slice 1 (GM-authoritative
   broadcast of existing PATCH results) ships visible value fast but is explicitly a stepping
   stone with the same conflict weaknesses as today. Worth confirming the team wants that
   incremental win rather than holding the feature dark until Plan B/C land.
5. **Connection cap and rate-limit numbers for the `/share` namespace** (N≈10 sockets/token,
   IP-based handshake cooldown) are placeholders reasoned from "a table is small" — confirm
   these against how large the biggest real campaigns' player counts get before Plan D encodes
   them as constants.
