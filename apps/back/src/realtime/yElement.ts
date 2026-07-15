import * as Y from 'yjs';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import { Types } from 'mongoose';
import { Element } from '../models/Element';
import { deriveBodyText } from '../elements/bodyText';
import { mentionLinks } from '../elements/links';

/** One live Yjs document per element being co-edited. */
interface Room {
  doc: Y.Doc;
  sockets: Set<string>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
  /** Resolves when the doc is hydrated from the DB; holds the one-time seed. */
  ready: Promise<void>;
  seedFrom: unknown | null;
  seedClaimed: boolean;
}

const rooms = new Map<string, Room>();
const SAVE_DEBOUNCE_MS = 2000;
// TipTap Collaboration binds to ydoc.getXmlFragment('default').
const FRAGMENT = 'default';

/**
 * Join (creating if needed) an element's Yjs room. Returns the current doc state
 * and — only for the first joiner of a never-collaborated element — the existing
 * `body` to seed the empty doc from (server controls who seeds, avoiding races).
 *
 * The room is registered in `rooms` synchronously, before any `await`, so two
 * concurrent joins on the same never-collaborated element can't both create a
 * room: the second joiner sees the first's room and awaits the same hydration
 * (`room.ready`), and `seedClaimed` ensures only one of them gets `seedFrom`.
 */
export async function joinRoom(
  elementId: string,
  socketId: string,
): Promise<{ state: Uint8Array; seedFrom: unknown | null }> {
  let room = rooms.get(elementId);
  if (!room) {
    const doc = new Y.Doc();
    const r: Room = {
      doc,
      sockets: new Set<string>(),
      saveTimer: null,
      dirty: false,
      seedFrom: null,
      seedClaimed: false,
      ready: undefined as unknown as Promise<void>, // assigned immediately below
    };
    // Register BEFORE any await so a concurrent join reuses this room.
    rooms.set(elementId, r);
    r.ready = (async () => {
      try {
        const el = await Element.findById(elementId).select('docState body');
        if (el?.docState) {
          Y.applyUpdate(doc, new Uint8Array(el.docState as Buffer));
        } else if (el && el.body != null) {
          r.seedFrom = el.body; // exactly one joiner will claim this
        }
      } catch (err) {
        console.error('yjs hydrate error:', err);
      }
      // Attach the update handler only AFTER hydration, so applying the stored
      // docState above doesn't mark the room dirty and schedule a spurious save.
      // Safe: clients only send updates after receiving yjs:init, which is
      // emitted after joinRoom returns — and joinRoom awaits this promise.
      doc.on('update', () => {
        r.dirty = true;
        scheduleSave(elementId);
      });
    })();
    room = r;
  }
  room.sockets.add(socketId);
  await room.ready; // every joiner waits for hydration
  let seedFrom: unknown | null = null;
  if (room.seedFrom != null && !room.seedClaimed) {
    room.seedClaimed = true; // hand the seed to exactly one client
    seedFrom = room.seedFrom;
  }
  return { state: Y.encodeStateAsUpdate(room.doc), seedFrom };
}

export function applyUpdate(elementId: string, update: Uint8Array): void {
  const room = rooms.get(elementId);
  if (room) Y.applyUpdate(room.doc, update);
}

export function leaveRoom(elementId: string, socketId: string): void {
  const room = rooms.get(elementId);
  if (!room) return;
  room.sockets.delete(socketId);
  if (room.sockets.size === 0) void saveRoom(elementId, true);
}

function scheduleSave(elementId: string): void {
  const room = rooms.get(elementId);
  if (!room || room.saveTimer) return;
  room.saveTimer = setTimeout(() => {
    room.saveTimer = null;
    void saveRoom(elementId, false);
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Persist the Yjs binary state AND derive `body` (PM JSON) + `bodyText`, so REST
 * load, search, and the share view keep working off the same element.
 */
async function saveRoom(elementId: string, cleanup: boolean): Promise<void> {
  const room = rooms.get(elementId);
  if (!room) return;
  if (room.dirty) {
    room.dirty = false;
    try {
      const docState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
      const body = yDocToProsemirrorJSON(room.doc, FRAGMENT);
      // Recompute mention links from the new body; preserve typed relationships
      // as they exist at write time via an atomic pipeline update (no read-then-write).
      const mentions = mentionLinks(body).map((l) => ({
        ...l,
        targetId: new Types.ObjectId(l.targetId),
      }));
      await Element.findByIdAndUpdate(elementId, [
        {
          $set: {
            docState: { $literal: docState },
            body: { $literal: body },
            bodyText: { $literal: deriveBodyText(body) },
            links: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ['$links', []] },
                    cond: { $eq: ['$$this.source', 'relationship'] },
                  },
                },
                { $literal: mentions },
              ],
            },
          },
        },
      ]);
    } catch (err) {
      console.error('yjs save error:', err);
    }
  }
  if (cleanup && room.sockets.size === 0) {
    if (room.saveTimer) clearTimeout(room.saveTimer);
    room.doc.destroy();
    rooms.delete(elementId);
  }
}
