// The Socket.IO event contract shared by the server (socket.io `Server`) and the
// client (socket.io-client `Socket`). Keeping the event names and payload shapes
// in one place means a change to either side is a compile error, not a runtime
// desync of the live co-editing / presence channel.

/** A participant currently present in an element room. */
export interface Participant {
  userId: string;
  displayName: string;
}

/** Broadcast set of participants for a room (the `presence` event). */
export interface PresencePayload {
  participants: Participant[];
}

/** Envelope identifying which element room an event targets. */
export interface ElementRef {
  elementId: string;
}

/** A binary Yjs doc / awareness update for an element room. */
export interface ElementBinary extends ElementRef {
  update: Uint8Array;
}

/** Initial Yjs state sent to a joiner. */
export interface YjsInitPayload extends ElementRef {
  state: Uint8Array;
  /** Legacy `body` to seed an empty doc from (first joiner only); otherwise null. */
  seedFrom: unknown;
}

/** Envelope identifying which game-session room an event targets. */
export interface SessionRef {
  sessionId: string;
}

/** Full session snapshot broadcast on join and after every persisted write.
 *  `session` is exactly the REST `publicSession` shape (the client's GameSessionT);
 *  `seq` is a monotonic per-room counter so clients can detect missed broadcasts. */
export interface SessionStatePayload extends SessionRef {
  seq: number;
  session: {
    id: string;
    status: 'active' | 'ended';
    sourceEncounterId: string | null;
    round: number;
    turnIndex: number;
    combatants: unknown[]; // typed loosely here; Plan 010 moves Combatant into shared
    log: unknown[];
    startedAt: string | Date;
    endedAt: string | Date | null;
  };
}

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  'element:join': (p: ElementRef) => void;
  'element:leave': (p: ElementRef) => void;
  'yjs:join': (p: ElementRef) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
  'yjs:leave': (p: ElementRef) => void;
  'session:join': (p: SessionRef) => void;
  'session:leave': (p: SessionRef) => void;
}

/** Events the server emits to the browser. */
export interface ServerToClientEvents {
  presence: (p: PresencePayload) => void;
  'yjs:init': (p: YjsInitPayload) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
  'session:state': (p: SessionStatePayload) => void;
}

// ── Player share view (read-only `/share` namespace) ────────────────────────
// Deliberately SEPARATE from ClientToServerEvents/ServerToClientEvents above:
// the `/share` namespace has no mutation events at all (structurally — it
// registers no handlers for them), so merging these into the main contract
// would make session:applyDamage-shaped events compile-visible on an
// unauthenticated namespace. See docs/design/live-session.md, "Security
// considerations".

/** A single condition on a shared combatant (mirrors Combatant.conditions). */
export interface SharedCondition {
  name: string;
  rounds: number | null;
}

/** Player-facing combatant shape — monster HP is hidden ENTIRELY (operator
 *  decision 2026-07-14): only `isPlayer: true` combatants carry HP fields. */
export interface SharedCombatant {
  cid: string;
  name: string;
  initiative: number;
  isPlayer: boolean;
  conditions: SharedCondition[];
  currentHp?: number;
  maxHp?: number;
  tempHp?: number;
}

/** Player-facing log entry — `kind: 'note'` entries are filtered server-side;
 *  GM scratch notes never reach this namespace. */
export interface SharedLogEntry {
  at?: string | Date;
  kind: 'roll' | 'event';
  text: string;
  by?: string;
}

/** The `sharedSession()` whitelist (apps/back/src/share/serialize.ts), typed.
 *  No `deathSaves`, `notes`, or `sourceElementId` — ever. */
export interface SharedSessionView {
  round: number;
  turnIndex: number;
  status: 'active' | 'ended';
  combatants: SharedCombatant[];
  log: SharedLogEntry[];
}

/** `/share` namespace: read-only. There are NO client→server events besides
 *  the built-in connection handshake — the namespace registers zero mutation
 *  handlers, enforced structurally rather than by a permission check. */
export interface ShareServerToClientEvents {
  'session:state': (p: { seq: number; session: SharedSessionView }) => void;
  'session:none': () => void; // no active session for this campaign right now
}
