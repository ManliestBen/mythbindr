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

/** Events the browser sends to the server. */
export interface ClientToServerEvents {
  'element:join': (p: ElementRef) => void;
  'element:leave': (p: ElementRef) => void;
  'yjs:join': (p: ElementRef) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
  'yjs:leave': (p: ElementRef) => void;
}

/** Events the server emits to the browser. */
export interface ServerToClientEvents {
  presence: (p: PresencePayload) => void;
  'yjs:init': (p: YjsInitPayload) => void;
  'yjs:update': (p: ElementBinary) => void;
  'yjs:awareness': (p: ElementBinary) => void;
}
