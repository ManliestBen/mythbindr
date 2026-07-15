// The Socket.IO event contract shared by the server (socket.io `Server`) and the
// client (socket.io-client `Socket`). Keeping the event names and payload shapes
// in one place means a change to either side is a compile error, not a runtime
// desync of the live co-editing / presence channel.

import type { Combatant, LogEntry } from '../schemas/session';

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
    combatants: Combatant[];
    log: LogEntry[];
    startedAt: string | Date;
    endedAt: string | Date | null;
  };
}

// ── Session operations (Plan 010: server-authoritative state) ───────────────
// Individual operations, each small and named for the game action it
// represents — this is what lets the server apply real combat-tracker
// semantics (clamping HP, expiring conditions) in one place instead of
// trusting whatever shape of partial object a client PATCHed.

export interface NextTurnOp extends SessionRef {}
export interface PrevTurnOp extends SessionRef {}

export interface ApplyDamageOp extends SessionRef {
  cid: string; // Combatant.cid
  amount: number; // positive = damage, negative = healing; tempHp absorbs first
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
  'element:join': (p: ElementRef) => void;
  'element:leave': (p: ElementRef) => void;
  'yjs:join': (p: ElementRef) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
  'yjs:leave': (p: ElementRef) => void;
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
  presence: (p: PresencePayload) => void;
  'yjs:init': (p: YjsInitPayload) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
  'session:state': (p: SessionStatePayload) => void;
  /** Emitted instead of session:state when an op is rejected (bad cid, session
   *  already ended, unauthorized) — lets the client roll back an optimistic
   *  local change without guessing from a missing broadcast. */
  'session:opError': (p: SessionRef & { message: string }) => void;
}
